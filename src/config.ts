export const config = {
  supabaseUrl: process.env.SUPABASE_URL ?? '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  port: Number(process.env.PORT ?? 3000),
  demoMode: process.env.DEMO_MODE === 'true',
  chaos: new Set((process.env.CHAOS ?? '').split(',').filter(Boolean)),
};

export function requireEnv(name: 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'): string {
  const v = name === 'SUPABASE_URL' ? config.supabaseUrl : config.supabaseServiceRoleKey;
  if (!v) throw new Error(`Missing ${name} (see .env.example)`);
  return v;
}
