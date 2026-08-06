# ─────────────────────────────────────────────────────────────────────────────
# outputs.tf
# The handful of values you need after apply: where to push the image, where the
# app is reachable, and how to connect to the database.
# ─────────────────────────────────────────────────────────────────────────────

output "ecr_repository_url" {
  description = "Push the app image here: docker push <this>:<tag>"
  value       = aws_ecr_repository.app.repository_url
}

output "alb_dns_name" {
  description = "Public DNS name of the ALB. Point your domain's DNS at this (or use the Route53 record if configured)."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "ALB hosted zone id (for creating alias records in another account/zone)."
  value       = aws_lb.this.zone_id
}

output "app_url" {
  description = "Resolved public URL of the app."
  value       = local.site_url
}

output "ecs_cluster_name" {
  description = "ECS cluster name (for `aws ecs ...` commands)."
  value       = aws_ecs_cluster.this.name
}

output "ecs_service_name" {
  description = "ECS service name (for deploys / execute-command)."
  value       = aws_ecs_service.app.name
}

output "aurora_cluster_endpoint" {
  description = "Aurora writer endpoint (used by DIRECT_URL / migrations)."
  value       = aws_rds_cluster.this.endpoint
}

output "aurora_reader_endpoint" {
  description = "Aurora reader endpoint (read replicas)."
  value       = aws_rds_cluster.this.reader_endpoint
}

output "rds_proxy_endpoint" {
  description = "RDS Proxy endpoint (used by the pooled DATABASE_URL)."
  value       = aws_db_proxy.this.endpoint
}

output "cloudwatch_log_group" {
  description = "CloudWatch Logs group streaming the app container output."
  value       = aws_cloudwatch_log_group.app.name
}

output "app_secret_names" {
  description = "Secrets Manager secret names injected into the task. Fill the TODO-valued ones after apply."
  value       = keys(local.app_secret_arns)
}
