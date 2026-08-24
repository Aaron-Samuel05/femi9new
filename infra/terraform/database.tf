# ─────────────────────────────────────────────────────────────────────────────
# database.tf
# Aurora Serverless v2 (PostgreSQL) with an RDS Proxy in front.
#
#   App (pooled)  ──► RDS Proxy ──► Aurora writer/reader   (DATABASE_URL)
#   App (migrate) ─────────────────► Aurora writer          (DIRECT_URL)
#
# Why a proxy: Fargate tasks scale out and Prisma opens a connection pool per
# task; Aurora Serverless v2 has a bounded max_connections. RDS Proxy multiplexes
# those, protects the DB during scale events and failovers, and holds the DB
# credentials so the app never sees the master password directly.
#
# Encryption at rest, automated backups, PITR (continuous backups) and a
# Multi-AZ writer/reader pair are all enabled below.
# ─────────────────────────────────────────────────────────────────────────────

# ── Master password ──────────────────────────────────────────────────────────
# Generated, never human-chosen. override_special excludes URL-reserved
# characters (@ : / ? # [ ] % &) so it can be embedded in DATABASE_URL/DIRECT_URL
# without percent-encoding.
resource "random_password" "db" {
  count = local.create_database ? 1 : 0

  length           = 32
  special          = true
  override_special = "!*()-_=+"
}

# ── Subnet group ─────────────────────────────────────────────────────────────
# Aurora lives only in the private subnets — never publicly reachable.
resource "aws_db_subnet_group" "this" {
  count = local.create_database ? 1 : 0

  name       = "${local.name_prefix}-db-subnets"
  subnet_ids = local.private_subnet_ids
  tags       = merge(local.tags, { Name = "${local.name_prefix}-db-subnets" })
}

# ── Aurora cluster (Serverless v2) ───────────────────────────────────────────
resource "aws_rds_cluster" "this" {
  count = local.create_database ? 1 : 0

  cluster_identifier = "${local.name_prefix}-aurora"
  engine             = "aurora-postgresql"
  engine_mode        = "provisioned" # required for Serverless v2 (not "serverless")
  engine_version     = var.db_engine_version

  database_name   = var.db_name
  master_username = var.db_master_username
  master_password = random_password.db[0].result

  db_subnet_group_name   = aws_db_subnet_group.this[0].name
  vpc_security_group_ids = [local.db_security_group_id]
  port                   = 5432

  # Encryption at rest with the AWS-managed RDS key (aws/rds). Supply a
  # customer-managed kms_key_id here if your compliance posture requires one.
  storage_encrypted = true

  # Backups + PITR. backup_retention_period > 0 turns on continuous backups, so
  # you can restore to any second within the window.
  backup_retention_period      = var.db_backup_retention_days
  preferred_backup_window      = "18:00-19:00" # UTC == 23:30 IST-ish, low traffic
  preferred_maintenance_window = "sun:19:30-sun:20:30"
  copy_tags_to_snapshot        = true

  # Serverless v2 autoscaling range (in ACUs).
  serverlessv2_scaling_configuration {
    min_capacity = var.db_min_acu
    max_capacity = var.db_max_acu
  }

  # Ship Postgres logs to CloudWatch for debugging slow queries / errors.
  enabled_cloudwatch_logs_exports = ["postgresql"]

  # Safety rails: protect from destroy and take a final snapshot on deletion.
  deletion_protection       = var.db_deletion_protection
  skip_final_snapshot       = var.db_skip_final_snapshot
  final_snapshot_identifier = var.db_skip_final_snapshot ? null : "${local.name_prefix}-aurora-final"

  # The generated password rotates only when we intend it to; ignore drift from
  # out-of-band console changes to avoid surprise replacements.
  lifecycle {
    ignore_changes = [engine_version] # let minor version auto-upgrade in a maintenance window
  }

  tags = merge(local.tags, { Name = "${local.name_prefix}-aurora" })
}

# ── Cluster instances ────────────────────────────────────────────────────────
# db.serverless = Serverless v2 capacity. Creating two instances places a writer
# and a reader in different AZs, giving Multi-AZ high availability with automatic
# failover. Set db_instance_count=1 for a cheaper single-AZ writer.
resource "aws_rds_cluster_instance" "this" {
  count              = local.create_database ? var.db_instance_count : 0
  identifier         = "${local.name_prefix}-aurora-${count.index}"
  cluster_identifier = aws_rds_cluster.this[0].id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.this[0].engine
  engine_version     = aws_rds_cluster.this[0].engine_version

  publicly_accessible = false
  # Lower tier number = higher promotion priority on failover.
  promotion_tier = count.index

  tags = merge(local.tags, { Name = "${local.name_prefix}-aurora-${count.index}" })
}

# ─────────────────────────────────────────────────────────────────────────────
# RDS Proxy
# ─────────────────────────────────────────────────────────────────────────────

# IAM role the proxy assumes to read the DB credentials secret from Secrets
# Manager (defined in secrets.tf).
data "aws_iam_policy_document" "rds_proxy_assume" {
  count = local.create_database ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["rds.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "rds_proxy" {
  count = local.create_database ? 1 : 0

  name               = "${local.name_prefix}-rds-proxy-role"
  assume_role_policy = data.aws_iam_policy_document.rds_proxy_assume[0].json
  tags               = local.tags
}

data "aws_iam_policy_document" "rds_proxy_secret" {
  count = local.create_database ? 1 : 0

  statement {
    sid       = "ReadDbCredentials"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.db_credentials[0].arn]
  }
  # Secrets encrypted with the default aws/secretsmanager key are decryptable via
  # the secret grant; if you switch to a customer-managed KMS key, add a
  # kms:Decrypt statement scoped to that key ARN here.
}

resource "aws_iam_role_policy" "rds_proxy_secret" {
  count = local.create_database ? 1 : 0

  name   = "read-db-credentials"
  role   = aws_iam_role.rds_proxy[0].id
  policy = data.aws_iam_policy_document.rds_proxy_secret[0].json
}

resource "aws_db_proxy" "this" {
  count = local.create_database ? 1 : 0

  name                   = "${local.name_prefix}-proxy"
  engine_family          = "POSTGRESQL"
  role_arn               = aws_iam_role.rds_proxy[0].arn
  vpc_subnet_ids         = local.private_subnet_ids
  vpc_security_group_ids = [aws_security_group.rds_proxy[0].id]

  require_tls         = true # clients must connect over TLS (hence sslmode=require in the URLs)
  idle_client_timeout = 1800
  debug_logging       = false

  # Secret-based auth (IAM auth left DISABLED for simplicity; flip to REQUIRED if
  # you want the app to fetch short-lived IAM tokens instead of a password).
  auth {
    auth_scheme = "SECRETS"
    iam_auth    = "DISABLED"
    secret_arn  = aws_secretsmanager_secret.db_credentials[0].arn
    description = "Aurora master credentials for ${local.name_prefix}"
  }

  # The proxy validates it can read the credentials on create, so the secret
  # VERSION (not just the secret) must exist first.
  depends_on = [aws_secretsmanager_secret_version.db_credentials[0]]

  tags = merge(local.tags, { Name = "${local.name_prefix}-proxy" })
}

# Connection-pooling behaviour for the proxy.
resource "aws_db_proxy_default_target_group" "this" {
  count = local.create_database ? 1 : 0

  db_proxy_name = aws_db_proxy.this[0].name

  connection_pool_config {
    # Keep well under Aurora's max_connections so a task storm can't exhaust it.
    max_connections_percent      = 90
    max_idle_connections_percent = 50
    connection_borrow_timeout    = 120
  }
}

# Register the Aurora cluster as the proxy's target.
resource "aws_db_proxy_target" "this" {
  count = local.create_database ? 1 : 0

  db_proxy_name         = aws_db_proxy.this[0].name
  target_group_name     = aws_db_proxy_default_target_group.this[0].name
  db_cluster_identifier = aws_rds_cluster.this[0].cluster_identifier

  # A cluster can only be registered once it has an available instance.
  depends_on = [aws_rds_cluster_instance.this]
}


# ─────────────────────────────────────────────────────────────────────────────
# REUSE MODE — an Aurora cluster this stack did not create.
#
# Nothing above exists in this mode. What the rest of the stack needs from a
# database is three things: where to connect, who to connect as, and which
# schemas to put where. The first two are read here; the third is secrets.tf.
#
# NO RDS PROXY. The created path puts one in front of Aurora because Fargate
# scales out and Prisma opens a pool per task. Adding a proxy to somebody
# else's cluster is a different matter — it is a change to how the EXISTING
# tenant's connections are handled, and this stack has no business making it.
# The tasks connect directly, and the connection ceiling becomes something to
# watch rather than something to design away. See README.md.
# ─────────────────────────────────────────────────────────────────────────────

data "aws_rds_cluster" "existing" {
  count = local.create_database ? 0 : 1

  cluster_identifier = var.existing_database.cluster_identifier
}

# The master credentials, in the shape RDS Proxy writes them: {username, password}.
#
# READING THIS PUTS THE PASSWORD IN THIS STACK'S STATE. That is already true of
# the created path, where Terraform generates it — but it is worth saying out
# loud, because here the password is one an existing environment also depends
# on. The state backend is encrypted and locked for exactly this reason.
data "aws_secretsmanager_secret_version" "existing_db" {
  count = local.create_database ? 0 : 1

  secret_id = var.existing_database.credentials_secret
}

locals {
  existing_db_credentials = local.create_database ? null : jsondecode(
    data.aws_secretsmanager_secret_version.existing_db[0].secret_string
  )

  # One endpoint in reuse mode: the cluster writer. Both the pooled and the
  # direct connection strings point at it, because there is no proxy to pool
  # through — see the note above.
  db_endpoint        = local.create_database ? aws_rds_cluster.this[0].endpoint : data.aws_rds_cluster.existing[0].endpoint
  db_direct_endpoint = local.create_database ? aws_rds_cluster.this[0].endpoint : data.aws_rds_cluster.existing[0].endpoint
  db_pooled_endpoint = local.create_database ? aws_db_proxy.this[0].endpoint : data.aws_rds_cluster.existing[0].endpoint

  db_username = local.create_database ? var.db_master_username : local.existing_db_credentials.username
  db_password = local.create_database ? random_password.db[0].result : local.existing_db_credentials.password
  db_name     = local.create_database ? var.db_name : var.existing_database.database_name
}
