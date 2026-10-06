import { createClient } from "@supabase/supabase-js";

function requiredEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`缺少環境變數 ${name}`);
  }
  return value;
}

export const supabase = createClient(
  requiredEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  requiredEnv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
);
