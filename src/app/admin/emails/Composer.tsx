"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PeopleList } from "./PeopleList";
import type { AudiencePerson } from "./actions";
import { countAudience, listAudience, createCampaign, previewEmail, sendNextBatch, sendTestEmail, type ComposeState } from "./actions";

type Course = { id: string; title: string };
type Draft = { kind?: "promotion" | "update"; design?: string; include_contacts?: boolean; exclude_buyers_of?: string | null; subject?: string; heading?: string; body?: string; cta_label?: string | null; cta_url?: string | null; courses?: string[]; countries?: string[]; buyers_only?: boolean; groups?: string[]; pick?: string[] };

/** Sends the remaining batches one after another and shows progress. */
export function SendProgress({ id, total, onDone }: { id: string; total: number; onDone?: () => void }) {
  const [p, setP] = useState({ sent: 0, failed: 0, skipped: 0, pending: total });
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        for (let guard = 0; guard < 10000; guard++) {
          const r = await sendNextBatch(id);
          setP({ sent: r.sent, failed: r.failed, skipped: r.skipped, pending: r.pending });
          if (r.pending === 0 || r.status === "cancelled") break;
        }
        onDone?.();
      } catch (e) { setErr((e as Error).message); }
    })();
  }, [id, onDone]);
  const done = total - p.pending;
  const pct = total ? Math.round((done / total) * 100) : 100;
  return (
    <div className="grid gap-2 rounded-xl border border-line p-4">
      <div className="flex justify-between text-sm"><b>{p.pending ? "Sending… keep this page open" : "Finished"}</b><span className="tabular-nums">{done} / {total}</span></div>
      <div className="h-2 rounded-full bg-surface"><div className="h-2 rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
      <p className="text-xs text-muted">{p.sent} sent{p.skipped ? ` · ${p.skipped} not delivered (no email provider connected)` : ""}{p.failed ? ` · ${p.failed} failed (you can retry below)` : ""}</p>
      {err && <p className="text-xs text-danger">Stopped: {err}. Use “Continue sending” below to resume.</p>}
    </div>
  );
}

export type DesignOption = { id: string; label: string; description?: string | null; defaultSubject?: string | null };

export function Composer({ courses, draft, consenting, contacts, designs, isAdmin, groups = [] }: { courses: Course[]; draft?: Draft; consenting: number; contacts: number; designs: DesignOption[]; isAdmin: boolean; groups?: { name: string; count: number }[] }) {
  const [design, setDesign] = useState<string>(draft?.design ?? "message");
  const designed = design !== "message";
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<"promotion" | "update">(draft?.kind ?? "promotion");
  const [counted, setCount] = useState<number | null>(null);
  const [state, action, saving] = useActionState<ComposeState, FormData>(createCampaign, null);
  const [test, setTest] = useState<ComposeState>(null);
  const [preview, setPreview] = useState<{ html?: string; subject?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"now" | "schedule">("now");

  const [people, setPeople] = useState<AudiencePerson[] | "loading" | null>(null);
  // "match": everyone matching the filters; "pick": only the people ticked in the list
  const [who, setWho] = useState<"match" | "pick">(draft?.pick?.length ? "pick" : "match");
  const [picked, setPicked] = useState<Set<string>>(new Set((draft?.pick ?? []).map((e) => e.toLowerCase())));
  const [pool, setPool] = useState<AudiencePerson[] | null>(null);
  const [poolQ, setPoolQ] = useState("");
  const [withContacts, setWithContacts] = useState(Boolean(draft?.include_contacts));
  // "Only people I choose" with nobody ticked means nobody, never everyone
  const count = who === "pick" && picked.size === 0 ? 0 : counted;

  // live audience size
  const readTarget = () => {
    const fd = new FormData(form.current!);
    const audience = {
      courses: fd.getAll("courses").map(String),
      countries: String(fd.get("countries") ?? "").toUpperCase().split(/[^A-Z]+/).filter((c) => c.length === 2),
      buyers_only: fd.get("buyers_only") === "on",
      groups: fd.getAll("groups").map(String),
      pick: fd.getAll("pick").map(String),
    };
    const ex = String(fd.get("exclude_buyers_of") ?? "");
    const options = { include_contacts: fd.get("include_contacts") === "on" || audience.pick.length > 0, exclude_buyers_of: ex || null };
    return { kind: (designed || fd.get("kind") !== "update" ? "promotion" : "update") as "promotion" | "update", audience, options };
  };
  const showPeople = () => {
    if (!form.current) return;
    const t = readTarget();
    setPeople("loading");
    listAudience(t.kind, t.audience, t.options).then(setPeople).catch(() => setPeople(null));
  };
  const recount = () => {
    if (!form.current) return;
    setPeople(null);
    // "Only people I choose" with nobody ticked means nobody, never everyone
    if (who === "pick" && picked.size === 0) return;
    const t = readTarget();
    countAudience(t.kind, t.audience, t.options).then(setCount).catch(() => setCount(null));
  };
  useEffect(recount, [kind, design, who, picked, withContacts]); // eslint-disable-line react-hooks/exhaustive-deps
  // everyone who can be picked: students who can receive this kind of email, plus the contact list
  useEffect(() => {
    if (who !== "pick") return;
    listAudience(designed || kind !== "update" ? "promotion" : "update", {}, { include_contacts: true, exclude_buyers_of: null }).then(setPool).catch(() => setPool(null));
  }, [who, kind, designed]);
  const togglePick = (email: string) => setPicked((prev) => { const n = new Set(prev); if (n.has(email)) n.delete(email); else n.add(email); return n; });

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    if (isAdmin && mode === "now" && !confirm(`Send this email to ${count ?? "all matching"} people now?`)) e.preventDefault();
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
      <form ref={form} action={action} onSubmit={submit} onChange={(e) => { if ((e.target as HTMLElement).closest("[data-audience]")) recount(); }} className="grid content-start gap-5">
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-semibold">1 · Design</legend>
          <select name="design" value={design} onChange={(e) => {
            const next = e.target.value;
            const subj = form.current?.elements.namedItem("subject") as HTMLInputElement | null;
            const prev = designs.find((d) => d.id === design)?.defaultSubject;
            const want = designs.find((d) => d.id === next)?.defaultSubject;
            // fill in the design's suggested subject, unless someone already typed their own
            if (subj && want && (!subj.value.trim() || subj.value === prev)) subj.value = want;
            setDesign(next);
          }} className="fc-input">
            <option value="message">Simple message (you write the text)</option>
            {designs.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          {designed && <p className="text-xs text-muted">{designs.find((d) => d.id === design)?.description ?? "A ready-made email."} You only choose the subject line and, if you like, add a short personal note at the top. It is sent as a promotion, so only people who receive updates get it, with an unsubscribe link.</p>}
        </fieldset>

        <fieldset className={`grid gap-2 ${designed ? "hidden" : ""}`}>
          <legend className="mb-2 text-sm font-semibold">Type of email</legend>
          <label className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 has-[:checked]:border-ink">
            <input type="radio" name="kind" value="promotion" checked={kind === "promotion"} onChange={() => setKind("promotion")} className="mt-1 accent-black" />
            <span><b className="text-sm">Newsletter or promotion</b><span className="block text-xs text-muted">Weekly updates, new courses, offers. Only goes to people who receive updates ({consenting} today), with an unsubscribe link.</span></span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-lg border border-line p-3 has-[:checked]:border-ink">
            <input type="radio" name="kind" value="update" checked={kind === "update"} onChange={() => setKind("update")} className="mt-1 accent-black" />
            <span><b className="text-sm">Important update for students</b><span className="block text-xs text-muted">Service messages only (a session moved, new content in a course they own, a change to their access). Goes to everyone in the audience. Don&apos;t use it for offers.</span></span>
          </label>
        </fieldset>

        <fieldset data-audience className="grid gap-3">
          <legend className="mb-2 text-sm font-semibold">2 · Who gets it</legend>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={who === "match"} onChange={() => setWho("match")} /> Everyone who matches</label>
            <label className="flex items-center gap-2"><input type="radio" checked={who === "pick"} onChange={() => setWho("pick")} /> Only people I choose</label>
          </div>
          {who === "pick" && (
            <div className="grid gap-2 text-sm">
              <input type="hidden" name="who" value="pick" />
              {[...picked].map((e) => <input key={e} type="hidden" name="pick" value={e} />)}
              <div className="flex flex-wrap items-center gap-2">
                <input value={poolQ} onChange={(e) => setPoolQ(e.target.value)} placeholder="Search by name or email" className="fc-input !py-1.5 min-w-0 flex-1 text-sm" />
                <span className="text-xs text-muted">{picked.size} chosen</span>
                {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} className="text-xs underline">Clear</button>}
              </div>
              {pool === null && <p className="text-xs text-muted">Loading…</p>}
              {Array.isArray(pool) && [...picked].filter((e) => !pool.some((p) => p.email.toLowerCase() === e)).map((e) => (
                <p key={e} className="flex flex-wrap items-baseline gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                  <span><b>{e}</b> won&apos;t get this email: they have a FinCoursa account and turned off updates, or they unsubscribed.</span>
                  <button type="button" onClick={() => togglePick(e)} className="underline">Remove</button>
                </p>
              ))}
              {Array.isArray(pool) && (
                <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-lg border border-line px-3">
                  {pool.filter((p) => !poolQ || `${p.name ?? ""} ${p.email}`.toLowerCase().includes(poolQ.toLowerCase())).slice(0, 500).map((p) => {
                    const e = p.email.toLowerCase();
                    return (
                      <li key={e}><label className="flex cursor-pointer items-baseline gap-2 py-2">
                        <input type="checkbox" checked={picked.has(e)} onChange={() => togglePick(e)} />
                        <span className="min-w-0 break-all"><span className="font-medium text-ink">{p.name || p.email}</span>{p.name && <span className="text-muted"> · {p.email}</span>}</span>
                        <span className="ml-auto text-xs text-muted">{p.type}</span>
                      </label></li>
                    );
                  })}
                  {!pool.length && <li className="py-2 text-muted">Nobody can receive this kind of email yet.</li>}
                </ul>
              )}
              <p className="text-xs text-muted">Only people who can receive {designed || kind !== "update" ? "updates (they ticked it, and haven't unsubscribed)" : "this email"} are listed. Tip: in the Contacts tab you can tick people and click &quot;Email selected people&quot;.</p>
            </div>
          )}
          <div className={`grid gap-3 ${who === "pick" ? "hidden" : ""}`}>
          <div className="grid gap-1 text-sm">
            <span className="font-medium">Students of these courses <span className="font-normal text-muted">(none ticked = everyone)</span></span>
            <div className="grid max-h-44 gap-1 overflow-y-auto rounded-lg border border-line p-3">
              {courses.map((c) => (
                <label key={c.id} className="flex items-center gap-2"><input type="checkbox" name="courses" value={c.id} defaultChecked={draft?.courses?.includes(c.id)} />{c.title}</label>
              ))}
            </div>
          </div>
          <label className="grid gap-1 text-sm font-medium">Only these countries <span className="font-normal text-muted">(2-letter codes, e.g. AE, SA, IN; blank = all)</span>
            <input name="countries" defaultValue={draft?.countries?.join(", ") ?? ""} placeholder="All countries" className="fc-input uppercase" />
          </label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="buyers_only" defaultChecked={draft?.buyers_only} /> Only people who have bought something</label>
          <label className="grid gap-1 text-sm font-medium">Leave out people who already bought
            <select name="exclude_buyers_of" defaultValue={draft?.exclude_buyers_of ?? ""} className="fc-input">
              <option value="">Nobody (send to everyone above)</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <span className="text-xs font-normal text-muted">Use this for follow-up offers, so customers don&apos;t keep getting &quot;buy now&quot; emails.</span>
          </label>
          <label className={`flex items-start gap-2 text-sm ${kind === "update" && !designed ? "opacity-50" : ""}`}>
            <input type="checkbox" name="include_contacts" checked={withContacts && who === "match"} onChange={(e) => setWithContacts(e.target.checked)} disabled={(kind === "update" && !designed) || who === "pick"} className="mt-1" />
            <span>Also send to the contact list ({contacts} people without an account, from the Contacts tab)</span>
          </label>
          {withContacts && who === "match" && groups.length > 0 && (
            <div className="grid gap-1 pl-6 text-sm">
              <span className="text-xs text-muted">Only these groups <span>(none ticked = the whole contact list)</span></span>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {groups.map((g) => <label key={g.name} className="flex items-center gap-2"><input type="checkbox" name="groups" value={g.name} defaultChecked={draft?.groups?.includes(g.name)} />{g.name} <span className="text-xs text-muted">({g.count})</span></label>)}
              </div>
            </div>
          )}
          </div>
          <div className="grid gap-2 rounded-lg bg-surface px-3 py-2 text-sm">
            <p className="flex flex-wrap items-baseline justify-between gap-2">
              <span>This will go to <b>{count ?? "…"}</b> {count === 1 ? "person" : "people"}.</span>
              {count ? <button type="button" onClick={() => (people ? setPeople(null) : showPeople())} className="text-xs underline">{people ? "Hide the list" : "See who"}</button> : null}
            </p>
            {people === "loading" && <p className="text-xs text-muted">Loading…</p>}
            {Array.isArray(people) && <PeopleList people={people} />}
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-semibold">3 · {designed ? "Subject and note" : "Message"}</legend>
          <label className="grid gap-1 text-sm font-medium">Subject line<input name="subject" required maxLength={150} defaultValue={draft?.subject} placeholder="This week at FinCoursa: …" className="fc-input" /></label>
          <label className={`grid gap-1 text-sm font-medium ${designed ? "hidden" : ""}`}>Heading inside the email <span className="font-normal text-muted">(optional, defaults to the subject)</span>
            <input name="heading" maxLength={150} defaultValue={draft?.heading} placeholder="Hi {first_name}, here's what's new" className="fc-input" /></label>
          <label className="grid gap-1 text-sm font-medium">{designed ? <>Personal note at the top <span className="font-normal text-muted">(optional)</span></> : "Message"}
            <textarea name="body" required={!designed} rows={designed ? 4 : 10} defaultValue={draft?.body} className="fc-input" placeholder={"Write as you would a normal email.\n\nLeave a blank line between paragraphs. Links like https://fincoursa.com/... become clickable.\n{first_name} is replaced with each student's first name."} />
          </label>
          <div className={`grid gap-3 sm:grid-cols-2 ${designed ? "hidden" : ""}`}>
            <label className="grid gap-1 text-sm font-medium">Button text <span className="font-normal text-muted">(optional)</span><input name="cta_label" maxLength={40} defaultValue={draft?.cta_label ?? ""} placeholder="Register now" className="fc-input" /></label>
            <label className="grid gap-1 text-sm font-medium">Button link<input name="cta_url" defaultValue={draft?.cta_url ?? ""} placeholder="https://… or /courses/…" className="fc-input" /></label>
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm font-semibold">4 · {isAdmin ? "Send" : "Submit for approval"}</legend>
          {!isAdmin && <p className="text-xs text-muted">An admin checks your email before it goes out. Choose when it should go once approved.</p>}
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="mode" value="now" checked={mode === "now"} onChange={() => setMode("now")} /> Send now</label>
            <label className="flex items-center gap-2"><input type="radio" name="mode" value="schedule" checked={mode === "schedule"} onChange={() => setMode("schedule")} /> Schedule</label>
          </div>
          {mode === "schedule" && (
            <label className="grid gap-1 text-sm font-medium">Send on
              <input type="date" name="send_on" min={new Date().toISOString().slice(0, 10)} className="fc-input w-56" />
              <span className="text-xs font-normal text-muted">Goes out around 5:00 AM UAE time on that day.</span>
            </label>
          )}
          <label className="grid gap-1 text-sm font-medium">Send the test to <span className="font-normal text-muted">(blank = your own email)</span>
            <input name="test_to" type="email" placeholder="e.g. team@fincoursa.com" className="fc-input sm:w-80" />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={pending} onClick={() => form.current && start(async () => setPreview(await previewEmail(new FormData(form.current!))))}
              className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2.5 text-sm text-ink">Preview</button>
            <button type="button" disabled={pending} onClick={() => form.current && start(async () => setTest(await sendTestEmail(new FormData(form.current!))))}
              className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2.5 text-sm text-ink">Send a test</button>
            <button disabled={saving || state?.campaignId !== undefined || (who === "pick" && picked.size === 0)} className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5 text-sm">
              {saving ? "Saving…" : who === "pick" && picked.size === 0 ? "Choose at least one person" : !isAdmin ? "Submit for approval" : mode === "now" ? `Send to ${count ?? "…"} people` : "Schedule"}
            </button>
          </div>
          {test && <p className={`text-sm ${test.ok ? "text-success" : "text-danger"}`}>{test.message}</p>}
          {state && !state.campaignId && <p className={`text-sm ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>}
          {state?.campaignId && <SendProgress id={state.campaignId} total={state.total ?? 0} onDone={() => router.refresh()} />}
        </fieldset>
      </form>

      <div className="grid content-start gap-2 xl:sticky xl:top-24">
        <p className="text-sm font-semibold">Preview</p>
        {preview?.error && <p className="text-sm text-danger">{preview.error}</p>}
        {preview?.html ? (
          <>
            <p className="text-xs text-muted">Subject: <b className="text-ink">{preview.subject}</b></p>
            <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[640px] w-full rounded-xl border border-line bg-white" />
          </>
        ) : <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-muted">Press Preview to see the email as students will.</p>}
      </div>
    </div>
  );
}
