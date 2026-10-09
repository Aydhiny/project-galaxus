// Dumps every table in the public schema to backups/galaxus-<date>.json.
// Read-only. Usage: node --env-file=.env.local scripts/backup-db.mjs
import { neon } from "@neondatabase/serverless";
import { mkdirSync, writeFileSync } from "fs";

const sql = neon(process.env.DATABASE_URL);
const tables = await sql.query(
  `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
);
const dump = { createdAt: new Date().toISOString(), tables: {} };
for (const { table_name } of tables) {
  dump.tables[table_name] = await sql.query(`SELECT * FROM "${table_name}"`);
  console.log(`${table_name}: ${dump.tables[table_name].length} rows`);
}
mkdirSync("backups", { recursive: true });
const file = `backups/galaxus-${dump.createdAt.slice(0, 10)}.json`;
writeFileSync(file, JSON.stringify(dump, null, 2));
console.log(`saved ${file}`);
