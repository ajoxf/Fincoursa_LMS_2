import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings" };

async function save(form: FormData) {
  "use server";
  const user = await requireUser();
  const supabase = await createClient();
  const name = String(form.get("full_name") ?? "").trim().slice(0, 200);
  const country = String(form.get("country_code") ?? "").trim().toUpperCase().slice(0, 2) || null;
  await supabase.from("profiles").update({ full_name: name, country_code: country, marketing_opt_in: form.get("marketing") === "on" }).eq("id", user.id);
  const pw = String(form.get("password") ?? "");
  if (pw.length >= 8) await supabase.auth.updateUser({ password: pw });
  revalidatePath("/dashboard/settings");
}

export default async function SettingsPage() {
  const user = await requireUser("/dashboard/settings");
  const { data: p } = await (await createClient()).from("profiles").select("full_name, country_code, marketing_opt_in").eq("id", user.id).single();
  return (
    <div className="max-w-lg">
      <h1 className="text-3xl font-bold text-primary">Settings</h1>
      <form action={save} className="fc-card mt-6 grid gap-4 p-6">
        <label className="grid gap-1 text-sm font-medium">Name on certificates<input name="full_name" defaultValue={p?.full_name ?? ""} className="fc-input" /></label>
        <label className="grid gap-1 text-sm font-medium">Email<input value={user.email ?? ""} disabled className="fc-input opacity-60" /></label>
        <label className="grid gap-1 text-sm font-medium">Country (2-letter code)<input name="country_code" maxLength={2} defaultValue={p?.country_code ?? ""} className="fc-input uppercase" /></label>
        <label className="grid gap-1 text-sm font-medium">New password<input name="password" type="password" minLength={8} autoComplete="new-password" className="fc-input" placeholder="Leave blank to keep current" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="marketing" defaultChecked={p?.marketing_opt_in} />Email me about new courses, live workshops and offers</label>
        <button className="fc-btn fc-btn-primary justify-self-start">Save</button>
      </form>
    </div>
  );
}
