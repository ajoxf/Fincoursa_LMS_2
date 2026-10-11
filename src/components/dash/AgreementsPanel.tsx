"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileUpload } from "./FileUpload";
import { deleteAgreement, saveAgreement } from "@/app/admin/agreements/actions";

type Item = {
  id: string; title: string; status: "awaiting" | "signed"; file_name: string | null; has_file: boolean;
  sent_at: string | null; signed_at: string | null; valid_until: string | null; notes: string | null;
};

const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);
const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the admin's own timezone

/** Agreements with an instructor or partner: record it, upload the signed copy, download it later. */
export function AgreementsPanel({ party, partyId, items, defaultTitle }: {
  party: "instructor" | "affiliate"; partyId: string; items: Item[]; defaultTitle: string;
}) {
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  return (
    <div className="grid gap-3">
      {items.length === 0 && editing === null && (
        <p className="text-sm text-muted">No agreement on file yet. Get it signed the usual way, then upload the signed copy here so it&apos;s kept with their record.</p>
      )}
      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line text-sm">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-3">
              <div className="min-w-0">
                <p className="font-medium">{a.title}
                  <span className={`ml-2 rounded-button px-2 py-0.5 text-[11px] font-semibold ${a.status === "signed" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                    {a.status === "signed" ? "Signed" : "Waiting for signature"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {[a.sent_at && `Sent ${fmt(a.sent_at)}`, a.signed_at && `Signed ${fmt(a.signed_at)}`, a.valid_until && `Valid until ${fmt(a.valid_until)}`].filter(Boolean).join(" · ") || "No dates recorded"}
                  {a.notes && <> · {a.notes}</>}
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                {a.has_file && <a href={`/api/agreements/${a.id}`} className="underline">Download{a.file_name ? ` (${a.file_name})` : ""}</a>}
                <button type="button" onClick={() => setEditing(a)} className="underline">{a.status === "awaiting" ? "Mark as signed / edit" : "Edit"}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing === null
        ? <button type="button" onClick={() => setEditing("new")} className="fc-btn fc-btn-outline justify-self-start !py-2 text-sm">+ Add agreement</button>
        : <AgreementForm key={editing === "new" ? "new" : editing.id} party={party} partyId={partyId} item={editing === "new" ? null : editing}
            defaultTitle={defaultTitle} onClose={() => setEditing(null)} />}
    </div>
  );
}

function AgreementForm({ party, partyId, item, defaultTitle, onClose }: {
  party: "instructor" | "affiliate"; partyId: string; item: Item | null; defaultTitle: string; onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? defaultTitle);
  const [status, setStatus] = useState<"awaiting" | "signed">(item ? (item.status === "awaiting" ? "signed" : item.status) : "signed");
  const [file, setFile] = useState<{ path: string; name: string } | null>(null);
  const [sentAt, setSentAt] = useState(item?.sent_at ?? "");
  const [signedAt, setSignedAt] = useState(item?.signed_at ?? today());
  const [validUntil, setValidUntil] = useState(item?.valid_until ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const hasCopy = Boolean(file || item?.has_file);

  const save = () => start(async () => {
    setMsg(null);
    const r = await saveAgreement({ id: item?.id, party, partyId, title, status, file, sent_at: sentAt || null, signed_at: signedAt || null, valid_until: validUntil || null, notes });
    if (!r.ok) { setMsg(r.error ?? "Could not save"); return; }
    onClose(); router.refresh();
  });

  return (
    <div className="grid gap-3 rounded-md border border-line bg-surface p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <label className="grid gap-1 text-sm font-medium">Agreement<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle} className="fc-input" /></label>
        <label className="grid gap-1 text-sm font-medium">Status
          <select value={status} onChange={(e) => setStatus(e.target.value as "awaiting" | "signed")} className="fc-input">
            <option value="signed">Signed</option>
            <option value="awaiting">Sent, waiting for signature</option>
          </select>
        </label>
      </div>
      <div className="grid gap-1 text-sm">
        <p className="font-medium">{status === "signed" ? "Signed copy" : "Agreement sent (optional)"}</p>
        {file ? <p className="text-success">Uploaded: {file.name}</p>
          : item?.has_file ? <p className="text-muted">On file: {item.file_name ?? "agreement"}. Upload a new one to replace it.</p> : null}
        <FileUpload bucket="agreements" courseId={`${party}-${partyId}`} accept=".pdf,.doc,.docx,image/png,image/jpeg,image/webp"
          label={hasCopy ? "Replace file" : status === "signed" ? "Upload signed copy" : "Upload the agreement"}
          onUploaded={(f) => setFile({ path: f.path, name: f.name })} />
        <p className="text-xs text-muted">PDF, Word or a photo/scan, up to 25 MB. Files are private: only admins, finance and the person themselves can open them.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">Sent on<input type="date" value={sentAt} onChange={(e) => setSentAt(e.target.value)} className="fc-input" /></label>
        {status === "signed" && <label className="grid gap-1 text-sm">Signed on<input type="date" value={signedAt} onChange={(e) => setSignedAt(e.target.value)} className="fc-input" /></label>}
        <label className="grid gap-1 text-sm">Valid until (optional)<input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="fc-input" /></label>
      </div>
      <label className="grid gap-1 text-sm">Notes (optional)<input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 40% revenue share, exclusive for live workshops" className="fc-input" /></label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={pending} onClick={save} className="fc-btn fc-btn-primary !py-2.5">{pending ? "Saving…" : "Save agreement"}</button>
        <button type="button" onClick={onClose} className="text-sm text-muted underline">Cancel</button>
        {item && (
          <button type="button" disabled={pending} className="ml-auto text-sm text-danger underline"
            onClick={() => { if (confirm(`Delete "${item.title}" and its file?`)) start(async () => { await deleteAgreement(item.id); onClose(); router.refresh(); }); }}>
            Delete
          </button>
        )}
        {msg && <span className="text-sm text-danger">{msg}</span>}
      </div>
    </div>
  );
}
