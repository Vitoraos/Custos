// npm run db:seed — verifies Supabase connectivity + v3 tables exist.
// DDL lives in infra/migrations/001_v3.sql (apply via dashboard SQL editor).
// Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Exits non-zero on failure.
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("db:seed: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, key);
const tables = [
  "memories",
  "action_receipts",
  "device_state",
  "fault_config",
  "list_items",
  "api_keys",
];
let ok = true;
for (const t of tables) {
  const { error } = await db
    .from(t)
    .select("id", { count: "exact", head: true });
  if (error) {
    console.error(`db:seed: table ${t}: ${error.message}`);
    ok = false;
  } else {
    console.log(`db:seed: table ${t}: ok`);
  }
}
if (!ok) process.exit(1);
console.log("db:seed: all v3 tables reachable");
