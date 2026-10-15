"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteInstructor } from "../actions";

export function DeleteInstructor({ id, name, courses, blocked }: { id: string; name: string; courses: number; blocked: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-2 text-sm">
      {blocked ? (
        <p className="text-muted">{name} has earnings or payouts on record, so they can&apos;t be deleted: the finance history has to stay. To take them off the site, untick &ldquo;Show on the Instructors page&rdquo; above and remove them from their courses.</p>
      ) : (
        <>
          <p className="text-muted">Deletes this instructor profile{courses ? `, removes them from ${courses} ${courses === 1 ? "course" : "courses"}` : ""} and deletes any agreements on file. Their login (if any) stays, without instructor access. This can&apos;t be undone.</p>
          <button type="button" disabled={pending} className="fc-btn fc-btn-outline justify-self-start !px-4 !py-2 text-sm text-danger"
            onClick={() => {
              if (!confirm(`Delete ${name}? This can't be undone.`)) return;
              start(async () => {
                const r = await deleteInstructor(id);
                if (r.ok) router.push("/admin/instructors"); else setError(r.error ?? "Could not delete");
              });
            }}>
            {pending ? "Deleting…" : "Delete instructor"}
          </button>
        </>
      )}
      {error && <p className="text-danger">{error}</p>}
    </div>
  );
}
