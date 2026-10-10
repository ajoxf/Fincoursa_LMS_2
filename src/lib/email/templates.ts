// Branded HTML email templates. Email clients don't support CSS variables, so the brand colours are
// repeated here: keep EMAIL_THEME in step with src/app/theme.css when the final theme is applied.
export const EMAIL_THEME = {
  primary: "#0b1f3a",
  accent: "#c8a24a",
  accentText: "#0b1f3a",
  text: "#1b2533",
  muted: "#5b6676",
  border: "#e3e6eb",
  surface: "#f5f6f8",
  font: "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  logo: "https://import.cdn.thinkific.com/1229196/custom_site_themes/id/nheg0rh2QRqGIOXG8FBU_header-logo.png",
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const T = EMAIL_THEME;

type Block = { html: string; text: string };
type Rendered = { subject: string; html: string; text: string };

function layout(opts: { preheader: string; heading: string; body: Block; cta?: { label: string; url: string }; footer?: string }): Omit<Rendered, "subject"> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.fincoursa.com";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;background:${T.surface};font-family:${T.font};color:${T.text}">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.surface};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${T.border};border-radius:12px">
<tr><td style="background:${T.primary};border-radius:12px 12px 0 0;padding:20px 28px"><img src="${T.logo}" alt="FinCoursa Academy" height="28" style="display:block;height:28px;color:#ffffff;font-size:18px;font-weight:700"></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${T.primary}">${esc(opts.heading)}</h1>
<div style="font-size:15px;line-height:1.6">${opts.body.html}</div>
${opts.cta ? `<p style="margin:28px 0 8px"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:${T.accent};color:${T.accentText};text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px">${esc(opts.cta.label)}</a></p>
<p style="margin:0;font-size:12px;color:${T.muted}">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(opts.cta.url)}</span></p>` : ""}
</td></tr>
<tr><td style="border-top:1px solid ${T.border};padding:16px 28px;font-size:12px;color:${T.muted}">${opts.footer ? esc(opts.footer) + "<br>" : ""}FinCoursa Academy · <a href="${site}" style="color:${T.muted}">${site.replace(/^https?:\/\//, "")}</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = `${opts.heading}\n\n${opts.body.text}${opts.cta ? `\n\n${opts.cta.label}: ${opts.cta.url}` : ""}\n\n—\nFinCoursa Academy · ${site}${opts.footer ? `\n${opts.footer}` : ""}`;
  return { html, text };
}

const p = (s: string): Block => ({ html: `<p style="margin:0 0 12px">${esc(s)}</p>`, text: s });
const join = (...b: Block[]): Block => ({ html: b.map((x) => x.html).join(""), text: b.map((x) => x.text).join("\n\n") });
const first = (name?: string | null) => (name?.trim().split(/\s+/)[0]) || "there";

export function welcomeEmail(o: { name?: string | null; dashboardUrl: string; coursesUrl: string }): Rendered {
  return {
    subject: "Welcome to FinCoursa Academy",
    ...layout({
      preheader: "Your account is ready. Here's how to get started.",
      heading: `Welcome, ${first(o.name)}`,
      body: join(
        p("Your FinCoursa account is ready. Learn from industry practitioners and build skills that work in the real world."),
        p("Browse the catalogue, start a free preview, or pick up a structured learning path. Everything you enrol in appears in your dashboard, with your progress saved as you go."),
      ),
      cta: { label: "Browse courses", url: o.coursesUrl },
      footer: "You're receiving this because you created a FinCoursa account.",
    }),
  };
}

export type ReceiptLine = { title: string; amount: string };
export function receiptEmail(o: {
  name?: string | null; orderNumber: number; date: string; lines: ReceiptLine[]; discount?: string | null;
  vatLabel?: string | null; vat?: string | null; total: string; invoiceUrl: string; learnUrl: string; trn?: string | null;
}): Rendered {
  const rows = o.lines.map((l) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${T.border}">${esc(l.title)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid ${T.border};white-space:nowrap">${esc(l.amount)}</td></tr>`).join("");
  const extra = [
    o.discount ? `<tr><td style="padding:6px 0;color:${T.muted}">Discount</td><td align="right" style="padding:6px 0;color:${T.muted}">−${esc(o.discount)}</td></tr>` : "",
    o.vat ? `<tr><td style="padding:6px 0;color:${T.muted}">${esc(o.vatLabel ?? "VAT")} (included)</td><td align="right" style="padding:6px 0;color:${T.muted}">${esc(o.vat)}</td></tr>` : "",
    `<tr><td style="padding:10px 0;font-weight:700">Total paid</td><td align="right" style="padding:10px 0;font-weight:700">${esc(o.total)}</td></tr>`,
  ].join("");
  const table: Block = {
    html: `<p style="margin:0 0 12px">Thank you, ${esc(first(o.name))}. Your payment was received and your course access is active.</p>
<p style="margin:0 0 4px;font-size:13px;color:${T.muted}">${o.trn ? "Tax invoice" : "Receipt"} #${o.orderNumber} · ${esc(o.date)}${o.trn ? ` · TRN ${esc(o.trn)}` : ""}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:8px 0 16px">${rows}${extra}</table>
<p style="margin:0 0 12px"><a href="${esc(o.invoiceUrl)}" style="color:${T.primary}">View or print your ${o.trn ? "tax invoice" : "invoice"}</a></p>`,
    text: `Thank you. Your payment was received.\n\n${o.trn ? "Tax invoice" : "Receipt"} #${o.orderNumber} · ${o.date}\n${o.lines.map((l) => `${l.title}: ${l.amount}`).join("\n")}${o.discount ? `\nDiscount: -${o.discount}` : ""}${o.vat ? `\n${o.vatLabel ?? "VAT"} (included): ${o.vat}` : ""}\nTotal paid: ${o.total}\n\nInvoice: ${o.invoiceUrl}`,
  };
  return {
    subject: `Your FinCoursa receipt #${o.orderNumber}`,
    ...layout({ preheader: `Payment received: ${o.total}`, heading: "You're enrolled", body: table, cta: { label: "Start learning", url: o.learnUrl } }),
  };
}

export function signInLinkEmail(o: { url: string; minutes: number }): Rendered {
  return {
    subject: "Your FinCoursa sign-in link",
    ...layout({
      preheader: "Sign in to FinCoursa with one click.",
      heading: "Sign in to FinCoursa",
      body: join(p("Click the button below to sign in. No password needed."), p(`For your security this link works once and expires in ${o.minutes} minutes.`)),
      cta: { label: "Sign in", url: o.url },
      footer: "If you didn't ask to sign in, you can ignore this email. Your account is safe.",
    }),
  };
}

export function passwordResetEmail(o: { url: string; minutes: number }): Rendered {
  return {
    subject: "Reset your FinCoursa password",
    ...layout({
      preheader: "Choose a new password for your FinCoursa account.",
      heading: "Reset your password",
      body: join(p("Click the button below, then choose a new password in your account settings."), p(`This link works once and expires in ${o.minutes} minutes.`)),
      cta: { label: "Reset password", url: o.url },
      footer: "If you didn't ask for this, ignore this email. Your password won't change.",
    }),
  };
}

export function courseCompletedEmail(o: { name?: string | null; course: string; certificateUrl: string; nextUrl: string }): Rendered {
  return {
    subject: `Congratulations, you completed ${o.course}`,
    ...layout({
      preheader: "Your certificate is ready to view and share.",
      heading: `Well done, ${first(o.name)}!`,
      body: join(
        p(`You've completed ${o.course}. Your certificate of completion is ready. It has its own verification link you can add to your CV or LinkedIn profile.`),
        { html: `<p style="margin:0 0 12px">Ready for the next step? <a href="${esc(o.nextUrl)}" style="color:${T.primary}">See what to learn next</a>.</p>`, text: `Next course ideas: ${o.nextUrl}` },
      ),
      cta: { label: "View your certificate", url: o.certificateUrl },
    }),
  };
}

export function partnerApprovedEmail(o: { name?: string | null; code: string; commissionPct: number; link: string; dashboardUrl: string }): Rendered {
  return {
    subject: "You're approved as a FinCoursa partner",
    ...layout({
      preheader: `Your referral code ${o.code} is live.`,
      heading: `Welcome aboard, ${first(o.name)}`,
      body: join(
        p(`Your partner account is approved. You earn ${o.commissionPct}% commission on every course sale you refer.`),
        { html: `<p style="margin:0 0 12px">Your referral link:<br><a href="${esc(o.link)}" style="color:${T.primary};word-break:break-all">${esc(o.link)}</a></p>`, text: `Your referral link: ${o.link}` },
        p("Commission becomes payable 30 days after each sale, once the refund window has passed. Add your payout details in the dashboard so we can pay you."),
      ),
      cta: { label: "Open your partner dashboard", url: o.dashboardUrl },
    }),
  };
}

export function payoutPaidEmail(o: { name?: string | null; amount: string; reference?: string | null; method?: string | null; role: "affiliate" | "instructor"; dashboardUrl: string }): Rendered {
  const what = o.role === "affiliate" ? "commission" : "course earnings";
  return {
    subject: `We've sent your FinCoursa payout: ${o.amount}`,
    ...layout({
      preheader: `${o.amount} is on its way.`,
      heading: `Your payout is on its way`,
      body: join(
        p(`Hi ${first(o.name)}, we've paid ${o.amount} of ${what}${o.method ? ` by ${o.method}` : ""}.`),
        ...(o.reference ? [p(`Transfer reference: ${o.reference}`)] : []),
        p("Bank transfers usually arrive within 1–3 business days. The full statement is in your dashboard."),
      ),
      cta: { label: "View statement", url: o.dashboardUrl },
    }),
  };
}

export function migrationInviteEmail(o: { name?: string | null; url: string; courseCount: number }): Rendered {
  return {
    subject: "FinCoursa has a new home: your courses are waiting",
    ...layout({
      preheader: "Same courses, same progress, a better learning experience.",
      heading: `Hi ${first(o.name)}, we've moved`,
      body: join(
        p("FinCoursa Academy now runs on its own platform. Your account has been moved across" + (o.courseCount ? `, along with your ${o.courseCount} ${o.courseCount === 1 ? "course" : "courses"} and your progress.` : ".")),
        p("Your old password doesn't carry over. Click the button, and we'll email you a one-click sign-in link straight away. You can set a new password afterwards in Settings."),
      ),
      cta: { label: "Sign in to my courses", url: o.url },
      footer: "You're receiving this because you have a FinCoursa account.",
    }),
  };
}
