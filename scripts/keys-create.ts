// npm run keys:create -- --user <user_id> [--mode forge|baseline] [--label ...]
// Prints the key ONCE (only its sha256 is stored). Needs Supabase creds.
import { createClient } from "@supabase/supabase-js";
import { newKey, sha256Hex } from "../src/auth.js";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = arg("user");
const mode = arg("mode", "forge");
if (!url || !key) {
  console.error(
    "keys:create: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
  );
  process.exit(1);
}
if (!userId) {
  console.error(
    "keys:create: usage: npm run keys:create -- --user <user_id> [--mode forge|baseline] [--label ...]",
  );
  process.exit(1);
}
if (mode !== "forge" && mode !== "baseline") {
  console.error("keys:create: --mode must be forge or baseline");
  process.exit(1);
}

const apiKey = newKey();
const { error } = await createClient(url, key)
  .from("api_keys")
  .insert({
    key_hash: sha256Hex(apiKey),
    user_id: userId,
    mode,
    label: arg("label") ?? null,
  });
if (error) {
  console.error(`keys:create: ${error.message}`);
  process.exit(1);
}
console.log(apiKey); // printed once — store it now, it cannot be recovered
