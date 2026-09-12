import pg from 'pg'

const client = new pg.Client({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'password',
  database: 'postgres',
})

await client.connect()
await client.query('DROP DATABASE IF EXISTS femi9 WITH (FORCE)')
await client.query("CREATE DATABASE femi9 WITH ENCODING = 'UTF8' TEMPLATE template0")
await client.end()

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
await femi9Client.end()

console.log('Database femi9 recreated with UTF8 encoding!')
