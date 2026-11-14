import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { PLAYBOOKS } from "./playbooks.generated";
import { getProfile, liveFacts, recentNumbers, topicSamples } from "./context";

/**
 * The marketing assistant (Admin → Marketing). For each task it gives Claude, in this order:
 * FinCoursa's rules, the relevant marketingskills playbooks (cached, they rarely change), the FinCoursa
 * profile, live facts and numbers, then what the user asked for. Replies come back as fixed JSON.
 */

export const MODEL = "claude-opus-5-5";
// Claude Opus 5.5 list prices, US$ per million tokens, for the cost shown next to each result
const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };

export const hasApiKey = () => Boolean(process.env.ANTHROPIC_API_KEY);

const str = (d: string) => z.string().describe(d);
const list = (d: string) => z.array(z.string()).describe(d);

export const SCHEMAS = {
  post: z.strictObject({
    title: str("A short internal name for this draft, e.g. 'Launch announcement'"),
    post_text: str("The full post, ready to paste. Short paragraphs separated by blank lines. No links in the post itself. No emojis."),
    first_comment: str("The comment to add straight after posting, with the link (LinkedIn shows posts with links to fewer people)"),
    hashtags: list("3 to 5 specific hashtags, each starting with #"),
    other_openings: list("Two alternative first lines to try instead of the post's opening"),
    image_idea: str("One simple image to attach and what text, if any, goes on it"),
    best_time: str("When to post, in plain words, with the timezone"),
    why_it_works: str("Two or three sentences, in plain words, on why this post should get attention from the target audience"),
  }),
  ad: z.strictObject({
    title: str("A short internal name for this ad"),
    campaign_name: str("Name to give the campaign in LinkedIn Campaign Manager"),
    objective: str("Which objective to choose in Campaign Manager and why, in one or two plain sentences"),
    ads: z.array(z.strictObject({
      intro_text: str("Text above the image, under 150 characters if possible"),
      headline: str("Headline under the image, under 70 characters"),
      button: str("The call-to-action button to choose, exactly as LinkedIn names it, e.g. Learn more"),
    })).describe("Three different versions of the ad to run side by side"),
    audience: z.strictObject({
      locations: list("Countries or regions to choose"),
      job_functions: list("LinkedIn job functions to choose"),
      job_titles: list("Job titles to choose, if title targeting is better here; else empty"),
      skills: list("Member skills to choose"),
      seniority: list("Seniority levels to choose, if any; else empty"),
      exclude: list("What to exclude, if anything"),
      settings_to_turn_off: list("Settings to switch off and why, e.g. Audience Expansion"),
    }),
    budget: z.strictObject({
      daily: str("Suggested daily budget with currency"),
      days: str("How many days to run before deciding"),
      total: str("Total spend for the test"),
      what_to_expect: str("Honest, plain estimate of clicks and results for this budget, stated as a rough range"),
    }),
    image_brief: str("What the ad image should show and the words on it"),
    setup_steps: list("Numbered, very simple steps to create this exact campaign in LinkedIn Campaign Manager, written for someone who has never used it"),
    check_after_3_days: list("What to look at after 3 days, what is good or bad, and what to do"),
  }),
  email: z.strictObject({
    title: str("A short internal name for this email"),
    subject: str("Subject line, under 60 characters"),
    other_subjects: list("Two alternative subject lines"),
    preview_text: str("The short line shown next to the subject in the inbox"),
    body: str("The email body: starts with 'Hi {first_name},', short paragraphs separated by blank lines, lines starting with '- ' for bullets. No emojis."),
    button_text: str("Text for the main button"),
    button_link: str("Full link for the button, from the live facts"),
    who_to_send_to: str("Who should get it and why, in plain words"),
  }),
  plan: z.strictObject({
    title: str("A short name, e.g. 'Plan for the week of 16 November'"),
    summary: str("Two or three plain sentences: where things stand and the one goal for this week"),
    days: z.array(z.strictObject({
      day: str("Day of the week"),
      task: str("What to do, in one plain sentence"),
      how: str("How to do it, in one or two plain sentences; say which assistant task to use if one helps"),
      minutes: z.number().int().describe("Roughly how many minutes it takes"),
      assistant_task: z.enum(["post", "ad", "email", "none"]).describe("Which assistant task does this, or none"),
    })).describe("One to three tasks a day, Monday to Friday"),
    number_to_watch: str("The one number to watch this week, and the target"),
  }),
  results: z.strictObject({
    title: str("A short name, e.g. 'Results for 8-14 November'"),
    summary: str("Plain-English summary of the numbers in three or four sentences, with no jargon"),
    working: list("What is working, each with the number that shows it"),
    not_working: list("What is not working or missing, each with the number that shows it"),
    next_steps: z.array(z.strictObject({ action: str("What to do"), why: str("Why, in one sentence") })).describe("Three next steps, most important first"),
    numbers_to_add: list("Numbers the user should look up elsewhere (e.g. LinkedIn page analytics) to complete the picture, and where to find them"),
  }),
  ask: z.strictObject({
    title: str("A short name for this question"),
    answer: str("A clear, plain-English answer for a beginner, specific to FinCoursa. Short paragraphs. Explain any term you use."),
    next_steps: list("Up to three concrete next steps"),
  }),
} as const;

export type Kind = keyof typeof SCHEMAS;
export type Output<K extends Kind> = z.infer<(typeof SCHEMAS)[K]>;

/** Which playbooks each task reads (paths inside marketing/playbooks). */
const PLAYBOOK_FILES: Record<Kind, string[]> = {
  post: ["social/SKILL.md", "social/references/platforms.md", "social/references/post-templates.md", "copywriting/SKILL.md", "copywriting/references/ai-tells.md"],
  ad: ["ads/SKILL.md", "ads/references/linkedin-b2b-playbook.md", "ads/references/audience-targeting.md", "ads/references/ad-copy-templates.md", "copywriting/references/ai-tells.md"],
  email: ["emails/SKILL.md", "emails/references/copy-guidelines.md", "copywriting/SKILL.md", "copywriting/references/ai-tells.md"],
  plan: ["launch/SKILL.md", "offers/SKILL.md", "social/SKILL.md"],
  results: ["launch/SKILL.md", "offers/SKILL.md"],
  ask: ["launch/SKILL.md", "social/SKILL.md", "offers/SKILL.md"],
};

const RULES = `You are FinCoursa's marketing assistant inside its admin panel. The person using you may have never used LinkedIn or done any marketing. Your job is to hand them finished work they can copy and use, plus simple steps.

FinCoursa's rules come first and override anything in the playbooks below:
- Write in plain, professional English. Explain any marketing term the first time you use it, in brackets.
- No emojis or emoticons anywhere. No hype words. No fake urgency.
- Only use facts from the FinCoursa profile, the live facts and the material given. Never invent numbers, results, reviews, testimonials, student names or pass rates. If something is unknown, say so.
- Only mention offers listed as live. Use the exact course links given.
- Education only: no financial or investment advice, no trading signals, no promised returns or exam results.
- Questions and market data in our material are fictional; never present them as real market events.
- FinCoursa is not affiliated with or endorsed by the CMT Association.
- Recommend only what can be done with LinkedIn, email and the FinCoursa admin. Do not recommend third-party tools or agencies.
- The playbooks are written for many kinds of businesses (often software). Use their principles, and adapt them to an exam-preparation business selling to finance professionals.

Reply only in the requested JSON format.`;

const TASK: Record<Kind, string> = {
  post: "Write one LinkedIn post for the details below.",
  ad: "Create one LinkedIn ad campaign for the details below. The setup steps must be simple enough for someone who has never opened LinkedIn Campaign Manager. LinkedIn's screens change over time, so name things as LinkedIn currently does and keep each step short.",
  email: "Write one marketing email for the details below. It is sent from FinCoursa's admin (Emails & updates) to people who agreed to marketing emails; an unsubscribe link is added automatically.",
  plan: "Make this week's marketing plan, using the numbers and live offers. Keep it realistic for the time available.",
  results: "Explain these numbers in plain English and say what to do next.",
  ask: "Answer the user's marketing question.",
};

function playbookText(kind: Kind) {
  return PLAYBOOK_FILES[kind].map((f) => `<playbook path="${f}">\n${PLAYBOOKS[f] ?? ""}\n</playbook>`).join("\n\n");
}

export class AssistantError extends Error {}

/** Run one task. Returns the parsed result and what it cost. */
export async function runTask<K extends Kind>(kind: K, input: Record<string, string>) {
  if (!hasApiKey()) throw new AssistantError("The assistant isn't switched on yet: add the ANTHROPIC_API_KEY in Vercel (see the setup steps).");
  const [profile, facts, numbers] = await Promise.all([getProfile(), liveFacts(), recentNumbers()]);
  const material = input.topic_id ? await topicSamples(input.topic_id) : null;

  const client = new Anthropic();
  const schema = SCHEMAS[kind];
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
    system: [
      // stable first, so it is cached across requests: rules, then this task's playbooks
      { type: "text", text: RULES },
      { type: "text", text: `Marketing playbooks (reference):\n\n${playbookText(kind)}`, cache_control: { type: "ephemeral" } },
    ],
    messages: [{
      role: "user",
      content: [
        `<fincoursa_profile>\n${profile}\n</fincoursa_profile>`,
        `<live_facts>\n${JSON.stringify(facts, null, 2)}\n</live_facts>`,
        `<recent_numbers>\n${JSON.stringify(numbers, null, 2)}\n</recent_numbers>`,
        material ? `<our_material topic="${material.topic}">\n${JSON.stringify(material.questions, null, 2)}\n</our_material>` : "",
        `<request>\n${TASK[kind]}\n${JSON.stringify(input, null, 2)}\n</request>`,
      ].filter(Boolean).join("\n\n"),
    }],
  });

  if (response.stop_reason === "refusal") throw new AssistantError("The assistant couldn't write this one. Try rewording your notes.");
  if (response.stop_reason === "max_tokens") throw new AssistantError("The answer was too long and got cut off. Try again with a narrower request.");
  const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let parsed: Output<K>;
  try {
    parsed = schema.parse(JSON.parse(text)) as Output<K>;
  } catch {
    throw new AssistantError("The assistant's answer came back in the wrong shape. Please try again.");
  }

  const u = response.usage;
  const cents = ((u.input_tokens * PRICE.input + u.output_tokens * PRICE.output
    + (u.cache_read_input_tokens ?? 0) * PRICE.cacheRead + (u.cache_creation_input_tokens ?? 0) * PRICE.cacheWrite) / 1_000_000) * 100;
  return { output: parsed, usage: { input_tokens: u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output_tokens: u.output_tokens, cost_cents: Math.round(cents * 100) / 100 } };
}
