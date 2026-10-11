import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/dash/Stat";
import { InstructorForm } from "./InstructorForm";
import { AgreementsPanel } from "@/components/dash/AgreementsPanel";
import { agreementsFor } from "@/lib/agreements";

export const metadata: Metadata = { title: "Edit instructor" };

export default async function EditInstructor({ params }: PageProps<"/admin/instructors/[id]">) {
  const { id } = await params;
  await requireRole(["admin"], `/admin/instructors/${id}`);
  const db = createAdminClient();
  const { data: ins } = await db.from("instructors").select("*, course_instructors(course:courses(id, title))").eq("id", id).maybeSingle();
  if (!ins) notFound();
  const { data: login } = ins.user_id ? await db.from("profiles").select("email").eq("id", ins.user_id).maybeSingle() : { data: null };
  const agreements = await agreementsFor({ type: "instructor", id });
  return (
    <div className="grid gap-6">
      <div>
        <Link href="/admin/instructors" className="text-sm text-muted hover:underline">← All instructors</Link>
        <h1 className="mt-2 text-3xl font-bold text-primary">{ins.name}</h1>
      </div>
      <Card title="Profile"><InstructorForm ins={ins} loginEmail={login?.email ?? null} /></Card>
      <Card title="Agreement">
        <AgreementsPanel party="instructor" partyId={id} items={agreements} defaultTitle="Instructor agreement" />
      </Card>
      <Card title="Courses">
        <ul className="text-sm">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(ins.course_instructors ?? []).map((ci: any) => <li key={ci.course.id} className="py-1"><Link href={`/admin/courses/${ci.course.id}`} className="underline">{ci.course.title}</Link></li>)}
          {!ins.course_instructors?.length && <li className="text-muted">Not assigned to a course yet — assign from the course editor.</li>}
        </ul>
      </Card>
    </div>
  );
}
