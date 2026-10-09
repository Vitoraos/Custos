// npm run db:seed — verifies Supabase connectivity + v3 tables exist.
// DDL lives in infra/migrations/001_v3.sql (apply via dashboard SQL editor).
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Exits non-zero on failure.
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("db:seed: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, key);
// Probe column per table (device_state/fault_config/api_keys have no `id`).
const tables: [string, string][] = [
  ["memories", "id"],
  ["action_receipts", "id"],
  ["device_state", "device"],
  ["fault_config", "user_id"],
  ["list_items", "id"],
  ["api_keys", "key_hash"],
];
let ok = true;
for (const [t, col] of tables) {
  const { error } = await db
    .from(t)
    .select(col, { count: "exact", head: true });
  if (error) {
    console.error(
      `db:seed: table ${t}: ${error.message || JSON.stringify(error)}`,
    );
    ok = false;
  } else {
    console.log(`db:seed: table ${t}: ok`);
  }
}
if (!ok) process.exit(1);
console.log("db:seed: all v3 tables reachable");
