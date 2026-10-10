import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export type Role = "student" | "instructor" | "affiliate" | "admin" | "finance" | "support";

export type SessionUser = {
  id: string;
  email: string | null;
  fullName: string | null;
  roles: Role[];
};

/** Current user with roles, or null. Cached per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  await cookies(); // always render per request, even before Supabase is configured
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: roles }, { data: profile }] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  return {
    id: user.id,
    email: user.email ?? null,
    fullName: profile?.full_name ?? null,
    roles: (roles ?? []).map((r) => r.role as Role),
  };
});

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/users/sign_in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

export async function requireRole(roles: Role[], next?: string): Promise<SessionUser> {
  const user = await requireUser(next);
  if (!roles.some((r) => user.roles.includes(r))) redirect("/dashboard?denied=1");
  return user;
}

export const hasRole = (u: SessionUser | null, r: Role) => Boolean(u?.roles.includes(r));
