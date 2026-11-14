import { createAdminClient } from "@/lib/supabase/admin";
import { getSetting } from "@/lib/site-settings";
import { hasApiKey } from "@/lib/marketing/assistant";
import { DEFAULT_PROFILE, getProfile, liveFacts, topics } from "@/lib/marketing/context";
import { Assistant, type SavedDraft } from "./Assistant";
import { saveMarketingProfile, toggleChecklist } from "./actions";

/** The one-time setup and weekly routine, for someone new to LinkedIn and marketing. */
const STEPS: { id: string; title: string; why: string; how: string[] }[] = [
  {
    id: "page", title: "Make the FinCoursa LinkedIn page look complete",
    why: "People check the page before they trust a post or an ad. An empty page loses them.",
    how: [
      "Sign in to linkedin.com, click \"Me\" (top right), then click the FinCoursa page under \"Manage\".",
      "Click \"Edit page\". Add the logo, a cover image, the website (https://fincoursa.com) and a one-line tagline.",
      "In \"Overview\", paste a short About text. Not sure what to write? Use Assistant → \"Ask a marketing question\": \"Write the About text for our LinkedIn page\".",
      "Set the page button to \"Visit website\".",
    ],
  },
  {
    id: "followers", title: "Get the first followers",
    why: "Posts from the page are shown first to its followers. More followers means more people see every post.",
    how: [
      "On the page, click \"Invite to follow\" and invite colleagues and contacts who work in finance or trading. LinkedIn gives a number of free invites each month.",
      "Ask the team to add FinCoursa as their employer on their own profiles. This links them to the page.",
      "Follow and take part in CMT and technical-analysis groups and conversations from your own profile.",
    ],
  },
  {
    id: "posting", title: "Post two or three times a week",
    why: "Steady posting builds trust with CMT candidates long before they are ready to buy.",
    how: [
      "Use Assistant → \"Write a LinkedIn post\". It gives you the text, the first comment with the link, and step-by-step posting instructions.",
      "Mix the goals: teach a CMT idea most weeks, mention the offer once a week at most.",
      "Reply to every comment on the same day.",
    ],
  },
  {
    id: "adsaccount", title: "Set up LinkedIn Campaign Manager (for ads)",
    why: "Campaign Manager is where LinkedIn ads are created and paid for. You only need to set it up once.",
    how: [
      "Go to linkedin.com/campaignmanager and sign in.",
      "Click \"Create account\". Name it \"FinCoursa\", choose your currency, and link it to the FinCoursa page.",
      "Add a payment card under \"Billing\". Nothing is charged until an ad runs.",
    ],
  },
  {
    id: "tag", title: "Switch on LinkedIn tracking",
    why: "Tracking tells LinkedIn which ads lead to sign-ups and sales, and lets you show ads again to people who visited fincoursa.com.",
    how: [
      "In Campaign Manager, open \"Analyze\" → \"Insight Tag\" and copy the number shown as the partner ID.",
      "Open the \"Tracking & emails\" tab here, paste it into \"Insight Tag partner ID\", and click Save.",
      "Optional: in Campaign Manager create two conversions, \"Sign-up\" and \"Purchase\", and paste their IDs in the same place.",
    ],
  },
  {
    id: "emails", title: "Switch on the automatic emails",
    why: "They remind people who started checking out, and tell subscribers before the offer closes, without you doing anything.",
    how: [
      "Open the \"Tracking & emails\" tab.",
      "Choose the course to promote, tick \"On\" for each email you want, and click \"Send me a test\" to see them.",
      "Click \"Save automatic emails\".",
    ],
  },
  {
    id: "firstad", title: "Run a small first ad",
    why: "A small test (for example US$10-15 a day for 7-10 days) shows what works before you spend more.",
    how: [
      "Use Assistant → \"Create a LinkedIn ad\". It gives you the ad text, who to show it to, the budget and setup steps.",
      "After 3 days, follow the \"After 3 days, check\" list that comes with the ad.",
    ],
  },
  {
    id: "weekly", title: "Every Monday: 15 minutes",
    why: "A short weekly routine keeps marketing going without taking over your week.",
    how: [
      "Assistant → \"Explain my results\": see what happened last week.",
      "Assistant → \"Plan this week\": get the to-do list, and click \"Do this now\" on each task.",
    ],
  },
];

const GLOSSARY: [string, string][] = [
  ["Company page", "FinCoursa's own page on LinkedIn, separate from your personal profile. People can follow it."],
  ["Post", "A message shared on LinkedIn. Followers see it in their feed."],
  ["Hashtag", "A word starting with # (e.g. #CMT) that helps people find posts on a topic."],
  ["Impressions", "How many times a post or ad was shown on screen."],
  ["Engagement", "Likes, comments, reposts and clicks on a post."],
  ["Click-through rate (CTR)", "The share of people who clicked after seeing an ad. 0.5% means 5 clicks per 1,000 views."],
  ["Cost per click (CPC)", "What you pay LinkedIn, on average, each time someone clicks the ad."],
  ["Campaign Manager", "LinkedIn's tool for creating, paying for and checking ads."],
  ["Objective", "What you tell LinkedIn the ad is for (e.g. website visits). LinkedIn shows the ad to people likely to do that."],
  ["Audience", "Who sees the ad: chosen by country, job, skills, seniority and so on."],
  ["Retargeting", "Showing ads again to people who already visited fincoursa.com."],
  ["Insight Tag", "A small piece of LinkedIn code on fincoursa.com that measures visits and sales from ads. It loads only for visitors who accept cookies."],
  ["Conversion", "An action you care about, such as a sign-up or a purchase."],
  ["Opt-in", "A person's agreement to receive marketing emails. Only these people get offers."],
];

export async function AssistantTab() {
  const [list, { data }] = await Promise.all([
    topics().catch(() => []),
    createAdminClient().from("marketing_drafts").select("id, kind, title, status, created_at, cost_cents, output, input")
      .neq("status", "archived").order("created_at", { ascending: false }).limit(20),
  ]);
  return <Assistant hasKey={hasApiKey()} topics={list} drafts={(data ?? []) as SavedDraft[]} />;
}

export async function StartTab() {
  const done = new Set((await getSetting<{ done?: string[] }>("marketing_checklist"))?.done ?? []);
  return (
    <div className="grid gap-6">
      <p className="max-w-3xl text-sm text-muted">
        Do these once, in order. Each takes 5 to 20 minutes. Tick a step when it&apos;s done ({done.size} of {STEPS.length} done).
      </p>
      <ol className="grid gap-3">
        {STEPS.map((s, i) => {
          const isDone = done.has(s.id);
          return (
            <li key={s.id} className={`rounded-xl border bg-white p-5 ${isDone ? "border-success/40" : "border-line"}`}>
              <details open={!isDone && [...STEPS].findIndex((x) => !done.has(x.id)) === i}>
                <summary className="flex cursor-pointer list-none items-center gap-3">
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${isDone ? "bg-success text-white" : "bg-surface"}`}>{isDone ? "✓" : i + 1}</span>
                  <span className={`text-lg font-semibold ${isDone ? "text-muted line-through" : ""}`}>{s.title}</span>
                </summary>
                <div className="mt-3 grid gap-3 pl-10">
                  <p className="text-sm text-muted"><b className="text-ink">Why:</b> {s.why}</p>
                  <ol className="grid list-decimal gap-1.5 pl-5 text-[15px]">{s.how.map((h, k) => <li key={k}>{h}</li>)}</ol>
                  <form><button formAction={toggleChecklist.bind(null, s.id, !isDone)} className={isDone ? "text-sm underline" : "fc-btn fc-btn-dark !min-w-0 !px-4 !py-1.5 text-sm"}>{isDone ? "Mark as not done" : "Mark as done"}</button></form>
                </div>
              </details>
            </li>
          );
        })}
      </ol>
      <div className="rounded-xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">Words you will see</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[200px_1fr]">
          {GLOSSARY.map(([k, v]) => <div key={k} className="contents"><dt className="font-semibold">{k}</dt><dd className="text-muted">{v}</dd></div>)}
        </dl>
      </div>
    </div>
  );
}

export async function AboutTab() {
  const [profile, facts, saved] = await Promise.all([getProfile(), liveFacts().catch(() => null), getSetting<{ text?: string }>("marketing_profile")]);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <form action={saveMarketingProfile} className="grid content-start gap-3 rounded-xl border border-line bg-white p-5">
        <h2 className="text-lg font-semibold">What the assistant knows about FinCoursa</h2>
        <p className="text-sm text-muted">
          The assistant reads this before every task. Keep it up to date: who you sell to, how FinCoursa should sound, and rules it must never break.
          Prices, offers and numbers are added automatically, so you don&apos;t need to type them.
        </p>
        <textarea name="profile" defaultValue={profile} rows={26} className="fc-input font-mono text-[13px] leading-relaxed" />
        <div className="flex flex-wrap items-center gap-4">
          <button className="fc-btn fc-btn-dark !min-w-0 !px-5 !py-2">Save</button>
          {saved?.text && <button name="profile" value="" className="text-sm underline">Go back to the original text</button>}
        </div>
        {!saved?.text && profile === DEFAULT_PROFILE && <p className="text-xs text-muted">This is the original text written for FinCoursa.</p>}
      </form>
      <aside className="grid content-start gap-3 rounded-xl border border-line bg-white p-5 text-sm">
        <h2 className="text-lg font-semibold">Added automatically</h2>
        <p className="text-muted">Live facts the assistant also sees, taken from your settings today:</p>
        {facts?.courses.length ? facts.courses.map((c) => (
          <div key={c.link} className="grid gap-1 border-t border-line pt-3">
            <p className="font-semibold">{c.title}</p>
            <p>{c.prices.join(" / ")} · {c.access}</p>
            {c.live_offers.length ? <ul className="list-disc pl-5">{c.live_offers.map((o) => <li key={o}>{o}</li>)}</ul> : <p className="text-muted">No offers switched on.</p>}
          </div>
        )) : <p className="text-muted">No published courses.</p>}
        <p className="border-t border-line pt-3 text-muted">Plus the last 7 and 30 days of sign-ups, checkouts, sales and emails.</p>
      </aside>
    </div>
  );
}
