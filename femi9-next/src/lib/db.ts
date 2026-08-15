import { PrismaClient } from '@prisma/client'

// Single Prisma client across hot reloads / serverless invocations. Without the
// global cache, Next dev (and serverless) would spawn a new pool per reload and
// exhaust connections.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

/**
 * Interactive-transaction budget. Prisma's 5s default is sized for a database
 * one network hop away, which is what production is (Fargate → RDS Proxy →
 * Aurora, same VPC, sub-millisecond). It is NOT what a developer running the
 * integration suite against a hosted Postgres has: at ~250ms per round trip,
 * checkout's order transaction — a dozen sequential statements — spends its
 * whole budget on latency and dies with "Transaction already closed" partway
 * through reserving stock, which reads like an oversell bug rather than a slow
 * link. Configurable so the test env can buy headroom without loosening the
 * production ceiling that keeps a stuck transaction from pinning a connection.
 */
const TRANSACTION_TIMEOUT_MS = Number(process.env.PRISMA_TRANSACTION_TIMEOUT_MS) || 5_000

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    transactionOptions: { timeout: TRANSACTION_TIMEOUT_MS },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
