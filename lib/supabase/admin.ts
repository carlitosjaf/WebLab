import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`A variável ${name} precisa estar definida para o fluxo server-side.`);
  }

  return value;
}

export function getSupabaseServerClient() {
  return createClient<Database>(
    assertEnv(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL"),
    assertEnv(supabaseAnonKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

export function getSupabaseAdminClient() {
  return createClient<Database>(
    assertEnv(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL"),
    assertEnv(supabaseServiceRoleKey, "SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
