import { readdir, readFile } from 'node:fs/promises'
import postgres from 'postgres'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')
export const sql = postgres(process.env.DATABASE_URL)

const dir = new URL('../migrations/', import.meta.url)

// Runs every migrations/*.sql not yet recorded, in filename order, each in its own transaction.
export async function migrate() {
  await sql`create table if not exists _migrations (name text primary key, run_at timestamptz not null default now())`
  const done = new Set((await sql<{ name: string }[]>`select name from _migrations`).map((r) => r.name))
  for (const name of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue
    const text = await readFile(new URL(name, dir), 'utf8')
    await sql.begin(async (tx) => {
      await tx.unsafe(text)
      await tx`insert into _migrations (name) values (${name})`
    })
    console.log(`migrated ${name}`)
  }
}

export async function dbOk() {
  try {
    await sql`select 1`
    return true
  } catch {
    return false
  }
}
