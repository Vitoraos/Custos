// CLI arg helper: supports `--name value` and `--name=value`.
export function arg(name: string, fallback?: string): string | undefined {
  const eq = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(eq));
  if (hit) return hit.slice(eq.length);
  const i = process.argv.indexOf(`--${name}`);
  if (
    i >= 0 &&
    i + 1 < process.argv.length &&
    !process.argv[i + 1].startsWith("--")
  ) {
    return process.argv[i + 1];
  }
  return fallback;
}
export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
