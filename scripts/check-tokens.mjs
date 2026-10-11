// npm run web:tokens — token discipline: no raw px/rem literals in web src
// outside theme.css :root definitions. Every spatial/typographic value must
// reference a var(--*) token (see theme.css header rule).
// Sole exemption: @media conditions (CSS forbids var() there) — the two
// breakpoints mirror --bp-stack/--bp-wide and are commented as such.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = "simulator/web/src";
const files = [];
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(css|tsx|ts)$/.test(p) && !p.endsWith(".d.ts")) files.push(p);
  }
};
walk(root);

let failures = 0;
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  // Track whether we are inside a top-level :root block (theme.css only).
  let rootDepth = -1;
  let depth = 0;
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, "");
    const opens = (code.match(/{/g) || []).length;
    if (/^\s*:root\b/.test(code)) rootDepth = depth;
    const inRootDef =
      rootDepth >= 0 && depth === rootDepth && opens > 0
        ? true
        : rootDepth >= 0 && depth > rootDepth;
    depth += opens - (code.match(/}/g) || []).length;
    if (depth <= rootDepth) rootDepth = -1;
    if (inRootDef) return;
    if (code.includes("@media")) return; // documented exemption (mirrors tokens)
    if (/animation|@keyframes|z-index/.test(code)) return; // not spatial scale
    const m = code.match(/(?<![\w-])\d+(\.\d+)?(px|r?em)\b/g);
    if (m) {
      console.log(
        `token violation ${f}:${i + 1}: ${m.join(", ")} :: ${line.trim().slice(0, 90)}`,
      );
      failures++;
    }
  });
}
if (failures > 0) {
  console.error(`web:tokens: ${failures} raw literals — use var(--*) tokens`);
  process.exit(1);
}
console.log("web:tokens: clean");
