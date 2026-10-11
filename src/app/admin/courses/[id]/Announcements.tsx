"use client";
import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAnnouncement, postAnnouncement, type AnnounceState } from "../announcement-actions";
import { SendProgress } from "@/app/admin/emails/Composer";

type Item = { id: string; title: string; body: string; created_at: string; emailed: string | null };

export function Announcements({ courseId, enrolled, items }: { courseId: string; enrolled: number; items: Item[] }) {
  const router = useRouter();
  const [state, action, saving] = useActionState<AnnounceState, FormData>(postAnnouncement.bind(null, courseId), null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-5">
      <form action={action} key={state?.ok ? state.message + (state.campaignId ?? "") : "form"} className="grid gap-3">
        <label className="grid gap-1 text-sm font-medium">Title<input name="title" required maxLength={150} placeholder="e.g. New lesson added: Fibonacci retracements" className="fc-input" /></label>
        <label className="grid gap-1 text-sm font-medium">Update
          <textarea name="body" required rows={4} className="fc-input" placeholder={"What changed and what students should do.\nLinks become clickable; {first_name} is replaced in the email."} />
        </label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email" defaultChecked /> Also email all {enrolled} enrolled {enrolled === 1 ? "student" : "students"}</label>
        <div><button disabled={saving} className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5 text-sm">{saving ? "Posting…" : "Post update"}</button></div>
        {state && !state.campaignId && <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
        {state?.campaignId && <SendProgress id={state.campaignId} total={state.total ?? 0} onDone={() => router.refresh()} />}
      </form>
      {items.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((a) => (
            <li key={a.id} className="grid gap-1 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium">{a.title}</p>
                <span className="text-xs text-muted">{a.created_at}{a.emailed ? ` · ${a.emailed}` : " · not emailed"}</span>
              </div>
              <p className="line-clamp-3 whitespace-pre-line text-sm text-ink/80">{a.body}</p>
              <button disabled={pending} onClick={() => { if (confirm("Delete this update? Students will no longer see it (emails already sent stay sent).")) start(() => deleteAnnouncement(courseId, a.id)); }}
                className="justify-self-start text-xs text-danger underline">Delete</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
