"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HOME_DEFAULTS, HOME_SECTIONS, type FaqItem, type HomeContent, type OrgTab } from "@/lib/home-content";
import { saveHomeText } from "./actions";

/** Every piece of wording on the home page, grouped by section, top to bottom. */
export function HomeTextAdmin({ content }: { content: HomeContent }) {
  const router = useRouter();
  const [t, setT] = useState<HomeContent>(content);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof HomeContent>(k: K, v: HomeContent[K]) => { setT((cur) => ({ ...cur, [k]: v })); setMsg(null); };

  const save = (data: Record<string, unknown>, done: string) => start(async () => {
    try { await saveHomeText(data); setMsg({ ok: true, text: done }); router.refresh(); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : "Could not save" }); }
  });

  const tabs = t.org_tabs;
  const setTab = (i: number, patch: Partial<OrgTab>) => set("org_tabs", tabs.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const faq = t.faq;
  const setFaq = (i: number, patch: Partial<FaqItem>) => set("faq", faq.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const move = <T,>(list: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= list.length) return list; const c = [...list]; [c[i], c[j]] = [c[j], c[i]]; return c; };

  const bar = (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" disabled={pending} onClick={() => save(t as unknown as Record<string, unknown>, "Saved. The home page is updated.")} className="fc-btn fc-btn-primary">
        {pending ? "Saving…" : "Save home page text"}
      </button>
      <a href="/" target="_blank" rel="noopener noreferrer" className="text-sm underline">View home page</a>
      {msg && <span className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</span>}
    </div>
  );

  return (
    <div className="grid gap-6">
      <p className="-mt-1 text-sm text-muted">Change any wording on the home page, then click Save. A box left empty goes back to the original wording.</p>

      {HOME_SECTIONS.map((s) => (
        <fieldset key={s.title} className="grid gap-3 rounded-card border border-line p-4">
          <legend className="px-1 text-sm font-semibold">{s.title}</legend>
          {s.fields.map((f) => (
            <label key={f.key} className="grid gap-1 text-sm font-medium">{f.label}
              {f.long
                ? <textarea rows={3} value={t[f.key]} placeholder={HOME_DEFAULTS[f.key]} onChange={(e) => set(f.key, e.target.value)} className="fc-input" />
                : <input value={t[f.key]} placeholder={HOME_DEFAULTS[f.key]} onChange={(e) => set(f.key, e.target.value)} className="fc-input" />}
            </label>
          ))}
          {s.title === "For organisations" && (
            <div className="grid gap-3">
              <p className="text-sm font-medium">Tabs <span className="font-normal text-muted">(the buttons on the left and what each one shows)</span></p>
              {tabs.map((tab, i) => (
                <div key={i} className="grid gap-2 rounded-md border border-line bg-surface p-3">
                  <div className="grid gap-2 md:grid-cols-[220px_1fr]">
                    <label className="grid gap-1 text-sm">Tab name<input value={tab.label} onChange={(e) => setTab(i, { label: e.target.value })} className="fc-input" /></label>
                    <label className="grid gap-1 text-sm">Heading<input value={tab.title} onChange={(e) => setTab(i, { title: e.target.value })} className="fc-input" /></label>
                  </div>
                  <label className="grid gap-1 text-sm">Ticked points, one per line
                    <textarea rows={4} value={tab.bullets.join("\n")} onChange={(e) => setTab(i, { bullets: e.target.value.split("\n") })} className="fc-input" />
                  </label>
                  <div className="flex gap-4 text-xs">
                    <button type="button" onClick={() => set("org_tabs", move(tabs, i, -1))} disabled={i === 0} className="underline disabled:opacity-40">Move up</button>
                    <button type="button" onClick={() => set("org_tabs", move(tabs, i, 1))} disabled={i === tabs.length - 1} className="underline disabled:opacity-40">Move down</button>
                    {tabs.length > 1 && <button type="button" onClick={() => set("org_tabs", tabs.filter((_, k) => k !== i))} className="text-danger underline">Remove tab</button>}
                  </div>
                </div>
              ))}
              {tabs.length < 6 && (
                <button type="button" onClick={() => set("org_tabs", [...tabs, { label: "", title: "", bullets: [] }])} className="fc-btn fc-btn-outline justify-self-start !py-2 text-sm">+ Add tab</button>
              )}
            </div>
          )}
        </fieldset>
      ))}

      <fieldset className="grid gap-3 rounded-card border border-line p-4">
        <legend className="px-1 text-sm font-semibold">FAQ (bottom of the page)</legend>
        {faq.map((f, i) => (
          <div key={i} className="grid gap-2 rounded-md border border-line bg-surface p-3">
            <label className="grid gap-1 text-sm font-medium">Question {i + 1}<input value={f.q} onChange={(e) => setFaq(i, { q: e.target.value })} className="fc-input" /></label>
            <label className="grid gap-1 text-sm">Answer<textarea rows={3} value={f.a} onChange={(e) => setFaq(i, { a: e.target.value })} className="fc-input" /></label>
            <div className="flex gap-4 text-xs">
              <button type="button" onClick={() => set("faq", move(faq, i, -1))} disabled={i === 0} className="underline disabled:opacity-40">Move up</button>
              <button type="button" onClick={() => set("faq", move(faq, i, 1))} disabled={i === faq.length - 1} className="underline disabled:opacity-40">Move down</button>
              {faq.length > 1 && <button type="button" onClick={() => set("faq", faq.filter((_, k) => k !== i))} className="text-danger underline">Remove question</button>}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => set("faq", [...faq, { q: "", a: "" }])} className="fc-btn fc-btn-outline justify-self-start !py-2 text-sm">+ Add question</button>
        <p className="text-xs text-muted">The first question opens by itself on the page. Questions without an answer aren&apos;t shown.</p>
      </fieldset>

      <div className="sticky bottom-0 -mx-5 grid gap-2 border-t border-line bg-white/95 px-5 py-3 backdrop-blur">
        {bar}
        <button type="button" disabled={pending} className="justify-self-start text-xs text-muted underline"
          onClick={() => { if (confirm("Put all home page wording back to the original? Your changes will be lost.")) { setT(HOME_DEFAULTS); save({}, "Back to the original wording."); } }}>
          Reset everything to the original wording
        </button>
      </div>
    </div>
  );
}
