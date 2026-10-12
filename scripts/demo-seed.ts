// npm run demo:seed -- --user demo — wipe + write the fixed demo household
// (infra/demo-household.json) into Supabase. Idempotent; re-run before takes.
// Asserts every rule loads through the policy (schema-drift tripwire).
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { DEMO_RULE_COUNT, seedDemoHousehold } from "../simulator/api/demo.js";
import { SupabaseStore } from "../src/storage/supabaseStore.js";
import { arg } from "./args.js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("demo:seed: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const userId = arg("user", "demo") as string;
const store = new SupabaseStore(createClient(url, key));
const s = await seedDemoHousehold(store, userId);
console.log(
  `demo:seed: ${s.userId}: ${s.rules} rules, ${s.facts} facts, ${s.devices} devices, list=[${s.items.join(", ")}], pantry=[${s.pantry.join(", ")}]`,
);
if (s.constraintsLoaded !== DEMO_RULE_COUNT) {
  console.error(
    `demo:seed: POLICY SEES ${s.constraintsLoaded}/${DEMO_RULE_COUNT} — bundle drifted`,
  );
  process.exit(1);
}
if (s.items.length !== 0) {
  console.error(
    `demo:seed: shopping list must start empty (it reveals on the dinner flow), found [${s.items.join(", ")}]`,
  );
  process.exit(1);
}
if (s.pantry.length === 0) {
  console.error("demo:seed: pantry must be stocked for the dinner flow");
  process.exit(1);
}
console.log("demo:seed: policy loads all rules");
