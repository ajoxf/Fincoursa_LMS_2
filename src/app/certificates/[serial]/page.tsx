import { Logo } from "@/components/site/Logo";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Certificate" };

// Public verification page: anyone with the ID can confirm the certificate is genuine.
export default async function CertificatePage({ params }: PageProps<"/certificates/[serial]">) {
  const { serial } = await params;
  if (!/^[A-F0-9]{6,24}$/.test(serial)) notFound();
  const { data: c } = await createAdminClient()
    .from("certificates").select("serial, recipient_name, issued_at, course:courses(title)").eq("serial", serial).maybeSingle();
  if (!c) notFound();
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const title = (c.course as any)?.title;
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4 print:bg-white">
      <div className="w-full max-w-3xl rounded-card border-8 border-double border-primary bg-bg p-10 text-center md:p-16">
        <span className="flex justify-center"><Logo tone="dark" className="h-10" /></span>
        <p className="fc-label mt-10">Certificate of completion</p>
        <p className="mt-6 text-muted">This certifies that</p>
        <p className="mt-2 text-4xl font-bold text-primary">{c.recipient_name}</p>
        <p className="mt-6 text-muted">has successfully completed</p>
        <p className="mt-2 text-2xl font-semibold">{title}</p>
        <p className="mt-10 text-sm text-muted">Issued {formatDate(c.issued_at, "long")} · Certificate ID {c.serial}</p>
      </div>
    </div>
  );
}
