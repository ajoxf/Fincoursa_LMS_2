"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { setDraftStatus } from "./actions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Kind = "post" | "ad" | "email" | "plan" | "results" | "ask";
export type SavedDraft = { id: string; kind: Kind; title: string; status: string; created_at: string; cost_cents: number | null; output: any; input: any };
type Result = { id: string | null; kind: Kind; output: any; cost_cents?: number | null };

const TASKS: { kind: Kind; title: string; text: string; time: string }[] = [
  { kind: "post", title: "Write a LinkedIn post", text: "A ready-to-paste post for the FinCoursa page, with the link, hashtags and the best time to post.", time: "about 1 minute" },
  { kind: "ad", title: "Create a LinkedIn ad", text: "Ad text, who to show it to, the budget, and click-by-click steps to set it up.", time: "1 to 2 minutes" },
  { kind: "email", title: "Write a marketing email", text: "An email for people who agreed to hear from you. Opens straight in Emails & updates.", time: "about 1 minute" },
  { kind: "plan", title: "Plan this week", text: "A simple day-by-day to-do list, based on your latest numbers and live offers.", time: "about 1 minute" },
  { kind: "results", title: "Explain my results", text: "Your sign-ups, checkouts and sales in plain English, and the next three things to do.", time: "about 1 minute" },
  { kind: "ask", title: "Ask a marketing question", text: "Anything you're unsure about, e.g. \"What should our LinkedIn page say?\"", time: "about 1 minute" },
];
const KIND_LABEL: Record<Kind, string> = { post: "LinkedIn post", ad: "LinkedIn ad", email: "Email", plan: "Weekly plan", results: "Results", ask: "Question" };

const POST_GOALS = [
  ["launch", "Announce the CMT Level II Question Bank"],
  ["teach", "Teach a CMT Level II idea (builds trust)"],
  ["offer", "Remind people about the launch offer"],
  ["story", "Share why we built FinCoursa"],
  ["news", "Share news or a milestone (add details below)"],
  ["other", "Something else (describe below)"],
];
const COUNTRIES = ["India", "United Arab Emirates", "United Kingdom", "United States", "Singapore"];

function Copy({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="shrink-0 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-semibold hover:bg-surface"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ } }}>
      {done ? "Copied" : label}
    </button>
  );
}

function Block({ label, text, hint, copy = true }: { label: string; text: string; hint?: string; copy?: boolean }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        {copy && text && <Copy text={text} />}
      </div>
      {hint && <p className="-mt-1 text-xs text-muted">{hint}</p>}
      <div className="whitespace-pre-line rounded-lg border border-line bg-surface p-3 text-[15px] leading-relaxed">{text}</div>
    </div>
  );
}

function Steps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-lg border border-accent bg-accent/15 p-4">
      <p className="font-semibold">{title}</p>
      <ol className="mt-2 grid list-decimal gap-1.5 pl-5 text-[15px]">{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
    </div>
  );
}

const Bullets = ({ items }: { items: string[] }) => <ul className="grid list-disc gap-1 pl-5 text-[15px]">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>;

const PUBLISH_PAGE = [
  "Open linkedin.com and sign in.",
  "Click \"Me\" (your photo, top right), then under \"Manage\" click the FinCoursa page.",
  "Click \"Create\" (or \"Start a post\").",
  "Click \"Copy\" next to the post above, then paste it into the box.",
  "Optional: add the picture described under \"Image idea\" (click the photo icon).",
  "Click \"Post\" at the time suggested.",
  "Straight away, click \"Comment\" under your new post, paste the \"First comment\" (it has the link), and post it.",
  "For the next hour, reply to anyone who comments. Replies help LinkedIn show the post to more people.",
];
const PUBLISH_PROFILE = [
  "Open linkedin.com and sign in. You are posting from your own profile.",
  "Click \"Start a post\" at the top of your feed.",
  "Click \"Copy\" next to the post above, then paste it into the box.",
  "Optional: add the picture described under \"Image idea\".",
  "Click \"Post\" at the time suggested.",
  "Straight away, add the \"First comment\" with the link under your post.",
  "Reply to comments for the next hour. Then reshare the post from the FinCoursa page.",
];

function ResultView({ r, onTask }: { r: Result; onTask: (k: Kind) => void }) {
  const o = r.output ?? {};
  switch (r.kind) {
    case "post":
      return (
        <div className="grid gap-4">
          <Block label="Post text" text={o.post_text} />
          <Block label="First comment (add right after posting)" text={o.first_comment} hint="Links inside a post reach fewer people, so the link goes in the first comment." />
          <Block label="Hashtags (add at the end of the post)" text={(o.hashtags ?? []).join(" ")} />
          {o.other_openings?.length > 0 && <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Other first lines you could try</p><Bullets items={o.other_openings} /></div>}
          <Block label="Image idea" text={o.image_idea} copy={false} />
          <Block label="Best time to post" text={o.best_time} copy={false} />
          <Block label="Why this should work" text={o.why_it_works} copy={false} />
          <Steps title="How to post it on LinkedIn" steps={r.output?._post_as === "profile" ? PUBLISH_PROFILE : PUBLISH_PAGE} />
        </div>
      );
    case "ad":
      return (
        <div className="grid gap-4">
          <p className="rounded-lg bg-surface p-3 text-sm">You will set this up in <b>LinkedIn Campaign Manager</b>, LinkedIn&apos;s tool for ads (linkedin.com/campaignmanager). If you haven&apos;t set it up yet, do step 4 in &ldquo;Getting started&rdquo; first.</p>
          <Block label="Campaign name" text={o.campaign_name} />
          <Block label="Objective to choose (what you want the ad to achieve)" text={o.objective} copy={false} />
          <div className="grid gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">The ads (run all three; LinkedIn shows the best one more)</p>
            {(o.ads ?? []).map((a: any, i: number) => (
              <div key={i} className="grid gap-3 rounded-lg border border-line p-3">
                <p className="text-sm font-semibold">Version {i + 1}</p>
                <Block label="Introductory text (above the picture)" text={a.intro_text} />
                <Block label="Headline (below the picture)" text={a.headline} />
                <Block label="Button" text={a.button} copy={false} />
              </div>
            ))}
          </div>
          <div className="grid gap-2 rounded-lg border border-line p-3 text-[15px]">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Who to show it to (the &ldquo;Audience&rdquo; section)</p>
            {([["Locations", o.audience?.locations], ["Job functions", o.audience?.job_functions], ["Job titles", o.audience?.job_titles], ["Skills", o.audience?.skills], ["Seniority", o.audience?.seniority], ["Exclude", o.audience?.exclude], ["Turn off", o.audience?.settings_to_turn_off]] as [string, string[]][])
              .filter(([, v]) => v?.length).map(([k, v]) => <p key={k}><b>{k}:</b> {v.join(", ")}</p>)}
          </div>
          <div className="grid gap-1 rounded-lg border border-line p-3 text-[15px]">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Budget</p>
            <p><b>Per day:</b> {o.budget?.daily} · <b>Run for:</b> {o.budget?.days} · <b>Total:</b> {o.budget?.total}</p>
            <p className="text-muted">{o.budget?.what_to_expect}</p>
          </div>
          <Block label="Picture for the ad" text={o.image_brief} copy={false} />
          <Steps title="How to set it up in Campaign Manager" steps={o.setup_steps ?? []} />
          <p className="-mt-2 text-xs text-muted">LinkedIn sometimes moves or renames buttons. If you can&apos;t find one, look for the closest match, or use &ldquo;Ask a marketing question&rdquo;.</p>
          <div className="grid gap-1"><p className="font-semibold">After 3 days, check:</p><Bullets items={o.check_after_3_days ?? []} /></div>
        </div>
      );
    case "email":
      return (
        <div className="grid gap-4">
          <Block label="Subject line" text={o.subject} />
          {o.other_subjects?.length > 0 && <div className="grid gap-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Other subject lines</p><Bullets items={o.other_subjects} /></div>}
          <Block label="Preview text" text={o.preview_text} />
          <Block label="Message" text={o.body} hint="{first_name} becomes each person's first name." />
          <Block label="Button" text={`${o.button_text} → ${o.button_link}`} copy={false} />
          <Block label="Who to send it to" text={o.who_to_send_to} copy={false} />
          {r.id && (
            <Link href={`/admin/emails?marketing=${r.id}#compose`} className="fc-btn fc-btn-dark justify-self-start !min-w-0 !px-5 !py-2">Open in Emails &amp; updates</Link>
          )}
          <Steps title="How to send it" steps={[
            "Click \"Open in Emails & updates\". The email is filled in for you.",
            "Read it once and change anything you like.",
            "Choose who gets it (leave the course boxes empty to send to everyone who agreed to marketing emails).",
            "Click \"Send me a test\" and check the email on your phone.",
            "Choose \"Send now\" or pick a date under \"Schedule\", then confirm.",
          ]} />
        </div>
      );
    case "plan":
      return (
        <div className="grid gap-4">
          <p className="text-[15px]">{o.summary}</p>
          <div className="grid gap-2">
            {(o.days ?? []).map((d: any, i: number) => (
              <div key={i} className="grid gap-1 rounded-lg border border-line p-3 sm:grid-cols-[110px_1fr_auto] sm:items-start sm:gap-4">
                <p className="font-semibold">{d.day}</p>
                <div><p className="font-medium">{d.task}</p><p className="text-sm text-muted">{d.how} · about {d.minutes} min</p></div>
                {d.assistant_task !== "none" && <button type="button" onClick={() => onTask(d.assistant_task)} className="justify-self-start rounded-md border border-line px-2.5 py-1 text-xs font-semibold hover:bg-surface">Do this now</button>}
              </div>
            ))}
          </div>
          <Block label="The number to watch this week" text={o.number_to_watch} copy={false} />
        </div>
      );
    case "results":
      return (
        <div className="grid gap-4">
          <p className="text-[15px]">{o.summary}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid content-start gap-1"><p className="font-semibold text-success">Working</p><Bullets items={o.working ?? []} /></div>
            <div className="grid content-start gap-1"><p className="font-semibold text-danger">Not working yet</p><Bullets items={o.not_working ?? []} /></div>
          </div>
          <div className="grid gap-2"><p className="font-semibold">Next steps</p>
            <ol className="grid list-decimal gap-1.5 pl-5 text-[15px]">{(o.next_steps ?? []).map((s: any, i: number) => <li key={i}><b>{s.action}</b> <span className="text-muted">{s.why}</span></li>)}</ol>
          </div>
          {o.numbers_to_add?.length > 0 && <div className="grid gap-1"><p className="font-semibold">To complete the picture, look up</p><Bullets items={o.numbers_to_add} /></div>}
        </div>
      );
    case "ask":
      return (
        <div className="grid gap-4">
          <div className="whitespace-pre-line text-[15px] leading-relaxed">{o.answer}</div>
          {o.next_steps?.length > 0 && <div className="grid gap-1"><p className="font-semibold">Next steps</p><Bullets items={o.next_steps} /></div>}
        </div>
      );
  }
}

const field = "fc-input";

function TaskForm({ kind, topics, onRun, running }: { kind: Kind; topics: { id: string; title: string }[]; onRun: (input: Record<string, string>) => void; running: boolean }) {
  const [goal, setGoal] = useState("launch");
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: Record<string, string> = {};
    for (const [k, v] of fd.entries()) {
      const s = String(v).trim();
      if (!s) continue;
      input[k] = input[k] ? `${input[k]}, ${s}` : s; // checkboxes with the same name
    }
    if (kind === "post") input.goal_description = POST_GOALS.find(([v]) => v === input.goal)?.[1] ?? input.goal;
    onRun(input);
  };
  const label = "grid gap-1.5 text-sm font-medium";
  return (
    <form onSubmit={submit} className="grid gap-4">
      {kind === "post" && <>
        <label className={label}>What is this post for?
          <select name="goal" value={goal} onChange={(e) => setGoal(e.target.value)} className={field}>{POST_GOALS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
        </label>
        {(goal === "teach" || goal === "other") && (
          <label className={label}>Topic to teach <span className="font-normal text-muted">The post is built on real questions and explanations from this unit.</span>
            <select name="topic_id" className={field} defaultValue={topics[0]?.id}>{topics.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</select>
          </label>
        )}
        <label className={label}>Post from
          <select name="post_as" className={field} defaultValue="page">
            <option value="page">The FinCoursa company page</option>
            <option value="profile">My own LinkedIn profile (more personal, often reaches more people)</option>
          </select>
        </label>
      </>}
      {kind === "ad" && <>
        <label className={label}>What should the ad do?
          <select name="goal" className={field} defaultValue="Send people to the course page to buy">
            <option>Send people to the course page to buy</option>
            <option>Remind people who already visited fincoursa.com (needs the LinkedIn tracking switched on)</option>
          </select>
        </label>
        <label className={label}>Who should see it?
          <select name="audience" className={field} defaultValue="CMT Level II candidates">
            <option>CMT Level II candidates</option>
            <option>Active trading and investment professionals</option>
            <option>Both</option>
          </select>
        </label>
        <fieldset className="grid gap-1.5 text-sm"><legend className="mb-1 font-medium">Countries</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">{COUNTRIES.map((c) => <label key={c} className="flex items-center gap-2"><input type="checkbox" name="countries" value={c} defaultChecked={c === "India" || c === "United Arab Emirates"} /> {c}</label>)}</div>
        </fieldset>
        <label className={label}>Daily budget you are comfortable with <span className="font-normal text-muted">LinkedIn&apos;s minimum is about US$10 a day per campaign.</span>
          <input name="daily_budget" className={`${field} sm:w-60`} placeholder="e.g. US$15 a day" />
        </label>
      </>}
      {kind === "email" && (
        <label className={label}>What is this email about?
          <select name="purpose" className={field} defaultValue="Launch announcement">
            <option>Launch announcement</option>
            <option>The launch offer ends soon</option>
            <option>New questions or content added</option>
            <option>Nudge people who signed up but haven&apos;t bought</option>
            <option>Something else (describe below)</option>
          </select>
        </label>
      )}
      {kind === "plan" && <>
        <label className={label}>How much time can you give marketing this week?
          <select name="time_available" className={field} defaultValue="About 3 hours"><option>About 1 hour</option><option>About 3 hours</option><option>5 hours or more</option></select>
        </label>
        <label className={label}>LinkedIn ads this week
          <select name="ads" className={field} defaultValue="No ads yet"><option>No ads yet</option><option>A small test (about US$10-20 a day)</option><option>Ads are already running</option></select>
        </label>
      </>}
      {kind === "ask" ? (
        <label className={label}>Your question
          <textarea name="question" required rows={4} className={field} placeholder="e.g. How do I get more people to follow the FinCoursa page?" />
        </label>
      ) : (
        <label className={label}>{kind === "results" ? "Add LinkedIn numbers if you have them (optional)" : "Anything to include or avoid? (optional)"}
          <textarea name="notes" rows={3} className={field} placeholder={kind === "results" ? "e.g. Page followers 120, last post 900 impressions" : "e.g. mention that 115 chart questions are included"} />
        </label>
      )}
      <button disabled={running} className="fc-btn fc-btn-primary justify-self-start !min-w-0 !px-6">{running ? "Writing… (30 to 90 seconds)" : "Write it for me"}</button>
    </form>
  );
}

export function Assistant({ hasKey, topics, drafts }: { hasKey: boolean; topics: { id: string; title: string }[]; drafts: SavedDraft[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [, start] = useTransition();
  const task = TASKS.find((t) => t.kind === kind);

  const open = (k: Kind) => { setKind(k); setResult(null); setError(null); window.scrollTo({ top: 0, behavior: "smooth" }); };

  async function run(input: Record<string, string>) {
    if (!kind) return;
    setRunning(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/admin/marketing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, input }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setResult({ id: data.id, kind, output: { ...data.output, _post_as: input.post_as }, cost_cents: data.cost_cents });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-6">
      {!hasKey && (
        <div className="rounded-xl border border-warning bg-warning/10 p-5 text-sm">
          <p className="text-base font-semibold">One-time setup: switch the assistant on</p>
          <ol className="mt-2 grid list-decimal gap-1 pl-5">
            <li>Go to <b>console.anthropic.com</b>, sign in, add a payment card, and set a monthly spend limit (for example US$40).</li>
            <li>Open <b>API keys</b> and click <b>Create key</b>. Copy it.</li>
            <li>In <b>Vercel</b>, open the FinCoursa project → <b>Settings</b> → <b>Environment Variables</b>. Add <code>ANTHROPIC_API_KEY</code> and paste the key. Save.</li>
            <li>Go to <b>Deployments</b> and click <b>Redeploy</b> on the latest one. This page will then work.</li>
          </ol>
          <p className="mt-2 text-muted">Each result costs a few US cents. The cost is shown next to every saved result.</p>
        </div>
      )}

      {!kind ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TASKS.map((t) => (
            <button key={t.kind} type="button" onClick={() => open(t.kind)} disabled={!hasKey}
              className="grid content-start gap-1 rounded-xl border border-line bg-white p-5 text-left hover:border-ink disabled:opacity-50">
              <span className="text-lg font-semibold">{t.title}</span>
              <span className="text-sm text-muted">{t.text}</span>
              <span className="mt-1 text-xs text-muted">Takes {t.time}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="grid gap-5 rounded-xl border border-line bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold">{task?.title}</h2>
            <button type="button" className="text-sm underline" onClick={() => { setKind(null); setResult(null); }}>← All tasks</button>
          </div>
          {!result && <TaskForm kind={kind} topics={topics} onRun={run} running={running} />}
          {error && <p className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{error}</p>}
          {result && (
            <>
              <ResultView r={result} onTask={open} />
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
                <button type="button" className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2" onClick={() => setResult(null)}>Write another</button>
                <span className="text-muted">Saved below under &ldquo;Your saved results&rdquo;{result.cost_cents != null ? ` · cost about US$${(result.cost_cents / 100).toFixed(2)}` : ""}</span>
              </div>
            </>
          )}
        </div>
      )}

      <div className="grid gap-2">
        <h2 className="text-lg font-semibold">Your saved results</h2>
        {drafts.length ? (
          <ul className="divide-y divide-line rounded-xl border border-line bg-white">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span className="min-w-0">
                  <b>{d.title}</b> <span className="text-muted">· {KIND_LABEL[d.kind]} · {new Date(d.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}{d.status === "used" ? " · used" : ""}</span>
                </span>
                <span className="flex gap-3 text-xs">
                  <button type="button" className="underline" onClick={() => { setKind(d.kind); setError(null); setResult({ id: d.id, kind: d.kind, output: { ...d.output, _post_as: d.input?.post_as }, cost_cents: d.cost_cents }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Open</button>
                  {d.status !== "used" && <button type="button" className="underline" onClick={() => start(() => setDraftStatus(d.id, "used"))}>Mark as used</button>}
                  <button type="button" className="text-muted underline" onClick={() => start(() => setDraftStatus(d.id, "archived"))}>Remove</button>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Nothing yet. Pick a task above to start.</p>}
      </div>
    </div>
  );
}
