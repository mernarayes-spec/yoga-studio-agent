/**
 * Reset script: wipes all data and re-seeds the database.
 * Usage: npx tsx scripts/reset.ts
 *
 * Note: migrations (DDL) must be run manually via the Supabase SQL Editor
 * since the REST API only supports data operations, not schema changes.
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local (Next.js convention)
config({ path: resolve(__dirname, "..", ".env.local") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSql(sql: string, label: string) {
  // Try exec_sql RPC (available if the function has been created)
  const { error } = await supabase.rpc("exec_sql", { sql });
  if (error) {
    throw new Error(`${label} failed: ${error.message}`);
  }
  console.log(`  ✓ ${label}`);
}

async function main() {
  console.log("Resetting database...\n");

  // Delete in FK order: conversation_messages → conversations → bookings → classes → members
  const deletions = [
    { table: "conversation_messages" as const, label: "Deleted conversation_messages" },
    { table: "conversations" as const, label: "Deleted conversations" },
    { table: "bookings" as const, label: "Deleted bookings" },
    { table: "classes" as const, label: "Deleted classes" },
    { table: "members" as const, label: "Deleted members" },
  ];

  for (const { table, label } of deletions) {
    const { error } = await supabase.from(table).delete().gte("created_at", "1970-01-01");
    if (error) {
      console.error(`Failed to delete ${table}: ${error.message}`);
      process.exit(1);
    }
    console.log(`  ✓ ${label}`);
  }

  // Read and execute seed SQL
  const seedPath = resolve(__dirname, "..", "supabase", "seed.sql");
  const seedSql = readFileSync(seedPath, "utf-8");

  console.log("\nSeeding database...\n");

  try {
    await runSql(seedSql, "Executed seed.sql");
  } catch {
    // If exec_sql rpc doesn't exist, try statement-by-statement approach
    console.log("  exec_sql rpc not available, executing statements individually...");

    // Split into statements (rough split, handles most cases)
    const statements = seedSql
      .split(/;[\s]*\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--"));

    for (const stmt of statements) {
      const { error } = await supabase.rpc("exec_sql", { sql: stmt + ";" });
      if (error) {
        console.error(`  ✗ Statement failed: ${error.message}`);
        console.error(`    SQL: ${stmt.slice(0, 100)}...`);
        process.exit(1);
      }
    }
    console.log(`  ✓ Executed ${statements.length} statements`);
  }

  console.log("\nDone! Database has been reset and seeded.");
}

main().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
