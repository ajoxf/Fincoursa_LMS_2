import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Certificates" };

export default async function CertificatesPage() {
  const user = await requireUser("/dashboard/certificates");
  const { data } = await (await createClient())
    .from("certificates").select("serial, issued_at, course:courses(title)").eq("user_id", user.id).order("issued_at", { ascending: false });
  return (
    <div>
      <h1 className="text-3xl font-bold text-primary">Certificates</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {(data ?? []).map((c: any) => (
          <Link key={c.serial} href={`/certificates/${c.serial}`} className="fc-card p-5 hover:shadow-md">
            <p className="font-semibold">{c.course?.title}</p>
            <p className="mt-1 text-xs text-muted">Issued {formatDate(c.issued_at)} · ID {c.serial}</p>
          </Link>
        ))}
        {!data?.length && <p className="text-muted">Finish a course to earn your first certificate.</p>}
      </div>
    </div>
  );
}
