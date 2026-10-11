"use client";
import { useActionState, useState, useTransition } from "react";
import type { CredentialField } from "@/lib/payments/types";
import { removeGatewayKeys, saveGatewayKeys, setGatewayEnabled, testGatewayKeys, type KeysState } from "./keys-actions";

export type ProviderView = {
  id: string;
  name: string;
  regions: string;
  keysHelp: string;
  webhookEvents: string[];
  fields: CredentialField[];
  currencies: string[] | null;
  webhookUrl: string;
  /** where each field's value comes from */
  sources: Record<string, "saved" | "env" | null>;
  hints: Record<string, string>;
  publicValues: Record<string, string>;
  enabled: boolean;
  hasKeys: boolean;
  savedHere: boolean;
  unreadable: boolean;
  canEdit: boolean;
};

function Status({ p }: { p: ProviderView }) {
  const [cls, text] = !p.hasKeys ? ["bg-warning/15 text-warning", "Keys missing"]
    : !p.enabled ? ["bg-surface text-muted", "Paused"]
    : ["bg-success/15 text-success", "Ready"];
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{text}</span>;
}

function Msg({ s }: { s: KeysState }) {
  if (!s) return null;
  return <p role="status" className={`rounded-lg px-3 py-2 text-sm ${s.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>{s.message}</p>;
}

/** One provider: status, keys form (secrets write-only), test, pause, remove. */
export function ProviderKeys({ p }: { p: ProviderView }) {
  const [open, setOpen] = useState(false);
  const [state, save, saving] = useActionState(saveGatewayKeys.bind(null, p.id), null);
  const [testState, setTestState] = useState<KeysState>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-card border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{p.name}</p>
          <p className="mt-0.5 text-xs text-muted">{p.regions}</p>
        </div>
        <Status p={p} />
      </div>

      {p.unreadable && (
        <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
          The saved secret keys can&apos;t be read any more (the encryption key changed). Enter them again.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {p.canEdit && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="fc-btn fc-btn-primary !min-w-0 !px-4 !py-2 text-sm">
            {open ? "Close" : p.hasKeys ? "Edit keys" : "Add API keys"}
          </button>
        )}
        {p.hasKeys && (
          <button type="button" disabled={pending} onClick={() => start(async () => setTestState(await testGatewayKeys(p.id)))}
            className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink">{pending ? "Testing…" : "Test connection"}</button>
        )}
        {p.canEdit && p.hasKeys && (
          <button type="button" disabled={pending} onClick={() => start(() => setGatewayEnabled(p.id, !p.enabled))}
            className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink">{p.enabled ? "Pause" : "Resume"}</button>
        )}
      </div>
      {testState && <div className="mt-3"><Msg s={testState} /></div>}

      {open && p.canEdit && (
        <form action={save} className="mt-4 grid gap-3 border-t border-line pt-4" autoComplete="off">
          <p className="text-xs text-muted">{p.keysHelp}</p>
          {p.fields.map((f) => {
            const src = p.sources[f.key];
            const note = src === "saved" ? (f.secret ? `Saved ${p.hints[f.key] ?? ""} · leave blank to keep` : "Saved")
              : src === "env" ? "Currently from a Vercel environment variable · enter a value here to override" : f.required ? "Required" : "Optional";
            return (
              <label key={f.key} className="grid gap-1 text-sm font-medium">
                <span className="flex flex-wrap items-baseline justify-between gap-2">{f.label}<span className="text-xs font-normal text-muted">{note}</span></span>
                {f.options ? (
                  <select name={f.key} defaultValue={p.publicValues[f.key] ?? f.options[0]} className="fc-input">
                    {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input name={f.key} type={f.secret ? "password" : "text"} defaultValue={f.secret ? "" : p.publicValues[f.key] ?? ""}
                    placeholder={f.secret && src === "saved" ? "••••••••  (unchanged)" : f.placeholder} spellCheck={false}
                    autoComplete={f.secret ? "new-password" : "off"} className="fc-input font-mono text-[13px]" />
                )}
                {f.help && <span className="text-xs font-normal text-muted">{f.help}</span>}
              </label>
            );
          })}

          <div className="grid gap-1 rounded-lg bg-surface p-3 text-xs">
            <span className="font-medium text-ink">Webhook / callback URL</span>
            <span className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all">{p.webhookUrl}</code>
              <button type="button" className="shrink-0 underline" onClick={() => { navigator.clipboard?.writeText(p.webhookUrl); setCopied(true); }}>{copied ? "Copied" : "Copy"}</button>
            </span>
            {p.webhookEvents.length > 0
              ? <span className="text-muted">Events to send: {p.webhookEvents.join(", ")}</span>
              : <span className="text-muted">Nothing to set up: we send this URL with each payment.</span>}
          </div>

          <Msg s={state} />
          <div className="flex flex-wrap items-center gap-3">
            <button disabled={saving} className="fc-btn fc-btn-primary !min-w-0 !px-5 !py-2.5 text-sm">{saving ? "Saving & testing…" : "Save & test"}</button>
            {p.savedHere && (
              <button type="button" disabled={pending}
                onClick={() => { if (confirm(`Remove the ${p.name} keys saved here? Buyers routed to ${p.name} will no longer be able to pay with it.`)) start(() => removeGatewayKeys(p.id)); }}
                className="text-sm text-danger underline">Remove saved keys</button>
            )}
          </div>
          <p className="text-[11px] text-muted">Secret keys are encrypted before they are stored and are never shown again. Only admins can change them.</p>
        </form>
      )}
    </div>
  );
}
