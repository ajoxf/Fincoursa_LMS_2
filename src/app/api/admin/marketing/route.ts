import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser, hasRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { allow } from "@/lib/rate-limit";
import { AssistantError, runTask, SCHEMAS, type Kind } from "@/lib/marketing/assistant";

// a careful answer can take a minute or two
export const maxDuration = 300;

/** Run one marketing-assistant task (admins only), save the result as a draft and return it. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user || !hasRole(user, "admin")) return NextResponse.json({ error: "Only admins can use the marketing assistant." }, { status: 403 });
  // keep costs bounded: at most 30 runs per admin per hour
  if (!(await allow("marketing-assistant", user.id, 30, 3600))) {
    return NextResponse.json({ error: "That's a lot of requests in one hour. Please wait a little and try again." }, { status: 429 });
  }

  const body = await request.json().catch(() => null) as { kind?: string; input?: Record<string, unknown> } | null;
  const kind = body?.kind as Kind;
  if (!kind || !(kind in SCHEMAS)) return NextResponse.json({ error: "Unknown task." }, { status: 400 });
  // only short text fields from the form
  const input: Record<string, string> = {};
  for (const [k, v] of Object.entries(body?.input ?? {})) {
    if (/^[a-z_]{1,40}$/.test(k) && (typeof v === "string" || typeof v === "number")) input[k] = String(v).slice(0, 2000);
  }

  try {
    const { output, usage } = await runTask(kind, input);
    const { data, error } = await createAdminClient().from("marketing_drafts").insert({
      kind, title: String((output as { title?: string }).title ?? kind).slice(0, 200), input, output,
      input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cost_cents: usage.cost_cents, created_by: user.id,
    }).select("id, created_at").single();
    if (error) console.error("[marketing] save draft", error.message);
    return NextResponse.json({ id: data?.id ?? null, created_at: data?.created_at ?? null, output, cost_cents: usage.cost_cents });
  } catch (e) {
    if (e instanceof AssistantError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[marketing] assistant", e);
    return NextResponse.json({ error: "The assistant is unavailable right now. Please try again in a minute." }, { status: 502 });
  }
}
