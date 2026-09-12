import EmbeddedPostgres from 'embedded-postgres'
import path from 'path'
import fs from 'fs'
import pg from 'pg'

const dataDir = path.join(process.cwd(), '.local-pg-data')
const isInit = !fs.existsSync(dataDir)

const pgServer = new EmbeddedPostgres({
  databaseDir: dataDir,
  port: 5432,
  user: 'postgres',
  password: 'password',
  persistent: true,
})

console.log('Starting local embedded Postgres on port 5432...')
if (isInit) {
  console.log('Initialising database cluster...')
  await pgServer.initialise()
}

await pgServer.start()
console.log('Embedded Postgres started on port 5432.')

// Connect and create databases/schemas
const client = new pg.Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'postgres',
})

await client.connect()

// Check if database 'femi9' exists
const res = await client.query("SELECT 1 FROM pg_database WHERE datname = 'femi9'")
if (res.rowCount === 0) {
  console.log("Creating database 'femi9'...")
  await client.query('CREATE DATABASE femi9')
}
await client.end()

// Connect to femi9 database to create schemas
const femi9Client = new pg.Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'femi9',
})
await femi9Client.connect()
await femi9Client.query('CREATE SCHEMA IF NOT EXISTS femi9')
await femi9Client.query('CREATE SCHEMA IF NOT EXISTS lumi9')
await femi9Client.query('CREATE SCHEMA IF NOT EXISTS platform')
console.log('Schemas created: femi9, lumi9, platform.')
await femi9Client.end()

console.log('Postgres is ready for connections!')

// Keep alive
process.stdin.resume()
