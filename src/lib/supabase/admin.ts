import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, serverSecret } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS — use only in trusted server code
 * (webhooks, fulfilment, admin actions after a role check).
 */
export function createAdminClient() {
  return createClient(env.supabaseUrl, serverSecret("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
