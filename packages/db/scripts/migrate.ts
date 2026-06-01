// Apply SQL migrations in order, tracked in public._migration. Runs as an owner /
// superuser connection (DATABASE_URL_ADMIN) because migrations CREATE ROLE / EXTENSION.
// The pgvector migration is skipped automatically where the extension is unavailable.

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

async function main(): Promise<void> {
  const adminUrl = process.env.DATABASE_URL_ADMIN ?? process.env.DATABASE_URL;
  if (!adminUrl) {
    throw new Error("migrate: set DATABASE_URL_ADMIN (owner/superuser connection).");
  }
  const sql = postgres(adminUrl, { max: 1, prepare: false, onnotice: () => {} });
  try {
    await sql`create table if not exists public._migration (
      id text primary key,
      applied_at timestamptz not null default now()
    )`;
    const appliedRows = await sql<{ id: string }[]>`select id from public._migration`;
    const applied = new Set(appliedRows.map((r) => r.id));

    const hasVectorRows = await sql<{ has_vector: boolean }[]>`
      select exists(select 1 from pg_available_extensions where name = 'vector') as has_vector`;
    const hasVector = hasVectorRows[0]?.has_vector ?? false;

    const hasStorageRows = await sql<{ has_storage: boolean }[]>`
      select exists(select 1 from information_schema.tables
                    where table_schema = 'storage' and table_name = 'objects') as has_storage`;
    const hasStorage = hasStorageRows[0]?.has_storage ?? false;

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`= skip ${file} (already applied)`);
        continue;
      }
      if (file.includes("pgvector") && !hasVector) {
        console.log(`~ skip ${file} (pgvector unavailable on this server; applies on Supabase)`);
        continue;
      }
      if (file.includes("storage") && !hasStorage) {
        console.log(`~ skip ${file} (no storage schema; Supabase-only)`);
        continue;
      }
      const content = await readFile(`${MIGRATIONS_DIR}/${file}`, "utf8");
      console.log(`+ applying ${file} ...`);
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`insert into public._migration (id) values (${file})`;
      });
      console.log(`  done`);
    }
    console.log("migrations complete");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
