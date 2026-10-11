// Branded HTML email templates. Email clients don't support CSS variables, so the brand colours are
// repeated here: keep EMAIL_THEME in step with src/app/theme.css when the final theme is applied.
export const EMAIL_THEME = {
  primary: "#000000",      // header band
  accent: "#d6fd3b",       // lime buttons
  accentText: "#101827",
  text: "#101827",
  muted: "#4b5563",
  border: "#e5e7eb",
  surface: "#f3f4f6",
  font: "Satoshi, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  // white logo for the black header band
  logo: "https://import.cdn.thinkific.com/1229196/custom_site_themes/id/K7xJCUqTUCsenKNBD5zw_header-logo.png",
};


const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const T = EMAIL_THEME;

type Block = { html: string; text: string };
type Rendered = { subject: string; html: string; text: string };

function layout(opts: { preheader: string; heading: string; body: Block; cta?: { label: string; url: string }; footer?: string; unsubscribeUrl?: string }): Omit<Rendered, "subject"> {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.fincoursa.com";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.heading)}</title></head>
<body style="margin:0;background:${T.surface};font-family:${T.font};color:${T.text}">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${T.surface};padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:${T.primary};padding:24px 28px"><span style="font-size:24px;font-weight:700;letter-spacing:-0.5px;color:#ffffff">FinCoursa</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 16px;font-size:28px;line-height:1.15;font-weight:400;letter-spacing:-0.5px;color:${T.text}">${esc(opts.heading)}</h1>
<div style="font-size:15px;line-height:1.6">${opts.body.html}</div>
${opts.cta ? `<p style="margin:28px 0 8px"><a href="${esc(opts.cta.url)}" style="display:inline-block;background:${T.accent};color:${T.accentText};text-decoration:none;font-weight:600;padding:14px 28px;border-radius:8px">${esc(opts.cta.label)}</a></p>
<p style="margin:0;font-size:12px;color:${T.muted}">Or paste this link into your browser:<br><span style="word-break:break-all">${esc(opts.cta.url)}</span></p>` : ""}
</td></tr>
<tr><td style="background:${T.primary};padding:16px 28px;font-size:12px;color:#d1d5db">${opts.footer ? esc(opts.footer) + "<br>" : ""}FinCoursa Academy · <a href="${site}" style="color:#d1d5db">${site.replace(/^https?:\/\//, "")}</a>${opts.unsubscribeUrl ? `<br><a href="${esc(opts.unsubscribeUrl)}" style="color:#d1d5db">Unsubscribe from marketing emails</a>` : ""}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${opts.heading}\n\n${opts.body.text}${opts.cta ? `\n\n${opts.cta.label}: ${opts.cta.url}` : ""}\n\n—\nFinCoursa Academy · ${site}${opts.footer ? `\n${opts.footer}` : ""}${opts.unsubscribeUrl ? `\nUnsubscribe from marketing emails: ${opts.unsubscribeUrl}` : ""}`;
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
  vatAdded?: boolean; reverseCharge?: boolean; sessions?: SessionLine[];
}): Rendered {
  const rows = o.lines.map((l) => `<tr><td style="padding:8px 0;border-bottom:1px solid ${T.border}">${esc(l.title)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid ${T.border};white-space:nowrap">${esc(l.amount)}</td></tr>`).join("");
  const extra = [
    o.discount ? `<tr><td style="padding:6px 0;color:${T.muted}">Discount</td><td align="right" style="padding:6px 0;color:${T.muted}">−${esc(o.discount)}</td></tr>` : "",
    o.vat ? `<tr><td style="padding:6px 0;color:${T.muted}">${esc(o.vatLabel ?? "VAT")} (${o.vatAdded ? "added" : "included"})</td><td align="right" style="padding:6px 0;color:${T.muted}">${esc(o.vat)}</td></tr>` : "",
    o.reverseCharge ? `<tr><td colspan="2" style="padding:6px 0;color:${T.muted}">Reverse charge: tax not charged; you account for it in your country.</td></tr>` : "",
    `<tr><td style="padding:10px 0;font-weight:700">Total paid</td><td align="right" style="padding:10px 0;font-weight:700">${esc(o.total)}</td></tr>`,
  ].join("");
  const table: Block = {
    html: `<p style="margin:0 0 12px">Thank you, ${esc(first(o.name))}. Your payment was received and your course access is active.</p>
<p style="margin:0 0 4px;font-size:13px;color:${T.muted}">${o.trn ? "Tax invoice" : "Receipt"} #${o.orderNumber} · ${esc(o.date)}${o.trn ? ` · TRN ${esc(o.trn)}` : ""}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:8px 0 16px">${rows}${extra}</table>
<p style="margin:0 0 12px"><a href="${esc(o.invoiceUrl)}" style="color:${T.primary}">View or print your ${o.trn ? "tax invoice" : "invoice"}</a></p>${o.sessions?.length ? sessionsHtml(o.sessions) : ""}`,
    text: `Thank you. Your payment was received.${o.sessions?.length ? `\n\nYour live sessions:\n${sessionsText(o.sessions)}` : ""}\n\n${o.trn ? "Tax invoice" : "Receipt"} #${o.orderNumber} · ${o.date}\n${o.lines.map((l) => `${l.title}: ${l.amount}`).join("\n")}${o.discount ? `\nDiscount: -${o.discount}` : ""}${o.vat ? `\n${o.vatLabel ?? "VAT"} (included): ${o.vat}` : ""}\nTotal paid: ${o.total}\n\nInvoice: ${o.invoiceUrl}`,
  };
  return {
    subject: `Your FinCoursa receipt #${o.orderNumber}`,
    ...layout({ preheader: `Payment received: ${o.total}`, heading: "You're enrolled", body: table, cta: { label: "Start learning", url: o.learnUrl } }),
  };
}

export type SessionLine = { title: string; day: string; times: string };

function sessionsHtml(sessions: SessionLine[]) {
  return `<div style="margin:20px 0 4px;padding:16px 18px;background:#000000;border-radius:12px;color:#ffffff">
<p style="margin:0 0 10px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${T.accent}">Your live sessions on Zoom</p>
${sessions.map((x) => `<p style="margin:0 0 10px"><b>${esc(x.day)}</b> · ${esc(x.title)}<br><span style="font-size:13px;color:#d1d5db">${esc(x.times)}</span></p>`).join("")}
<p style="margin:0;font-size:13px;color:#d1d5db">Join from your FinCoursa account. The Join button appears 15 minutes before the start, and recordings are added afterwards.</p></div>`;
}
const sessionsText = (sessions: SessionLine[]) => sessions.map((x) => `- ${x.day}, ${x.times}: ${x.title}`).join("\n");

/** Day-before reminder for a live session. */
export function liveReminderEmail(o: { name?: string | null; course: string; session: SessionLine; url: string; calendarUrl: string }): Rendered {
  const body: Block = {
    html: `<p style="margin:0 0 12px">Hi ${esc(first(o.name))}, a quick reminder that <b>${esc(o.course)}</b> is live soon.</p>${sessionsHtml([o.session])}
<p style="margin:16px 0 0;font-size:13px"><a href="${esc(o.calendarUrl)}" style="color:${T.primary}">Add it to your calendar</a></p>`,
    text: `Hi ${first(o.name)}, ${o.course} is live soon.\n${sessionsText([o.session])}\nJoin from your account: ${o.url}`,
  };
  return {
    subject: `Reminder: ${o.course} is live ${o.session.day}`,
    ...layout({ preheader: `${o.session.day}, ${o.session.times}`, heading: "See you live", body, cta: { label: "Open the session", url: o.url } }),
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

/** Sent when a course reaches 100%. With a certificate (courses where the admin switched it on) it links to it. */
export function courseCompletedEmail(o: { name?: string | null; course: string; certificateUrl?: string | null; nextUrl: string; courseUrl?: string }): Rendered {
  const cert = !!o.certificateUrl;
  return {
    subject: `Congratulations, you completed ${o.course}`,
    ...layout({
      preheader: cert ? "Your certificate is ready to view and share." : "You've finished every lesson. Here's what's next.",
      heading: `Well done, ${first(o.name)}!`,
      body: join(
        cert
          ? p(`You've completed ${o.course}. Your certificate of completion is ready. It has its own verification link you can add to your CV or LinkedIn profile.`)
          : p(`You've completed every lesson in ${o.course}. The course stays in your account, so you can go back to any lesson whenever you want a refresher.`),
        cert
          ? { html: `<p style="margin:0 0 12px">Ready for the next step? <a href="${esc(o.nextUrl)}" style="color:${T.primary}">See what to learn next</a>.</p>`, text: `Next course ideas: ${o.nextUrl}` }
          : o.courseUrl
            ? { html: `<p style="margin:0 0 12px"><a href="${esc(o.courseUrl)}" style="color:${T.primary}">Go back to the course</a> any time, or see what to learn next below.</p>`, text: `Go back to the course: ${o.courseUrl}` }
            : p("Ready for the next step? Have a look at what to learn next."),
      ),
      cta: cert ? { label: "View your certificate", url: o.certificateUrl! } : { label: "See what to learn next", url: o.nextUrl },
    }),
  };
}

/** Free enrolment (free course, free bundle or a 100% coupon). Paid orders get the receipt instead. */
export function enrolledEmail(o: { name?: string | null; title: string; courses?: string[]; url: string; sessions?: SessionLine[]; until?: string | null }): Rendered {
  const list = o.courses?.length
    ? { html: `<ul style="margin:0 0 12px;padding-left:20px">${o.courses.map((c) => `<li style="margin:0 0 4px">${esc(c)}</li>`).join("")}</ul>`, text: o.courses.map((c) => `- ${c}`).join("\n") }
    : null;
  return {
    subject: `You're enrolled: ${o.title}`,
    ...layout({
      preheader: `${o.title} is ready in your FinCoursa account.`,
      heading: "You're enrolled",
      body: join(
        p(`Hi ${first(o.name)}, ${o.title} is now in your FinCoursa account${o.until ? `, with access until ${o.until}` : ""}.`),
        ...(list ? [p("It includes these courses:"), list] : []),
        p("Start whenever you like. Your progress is saved as you go, and you can pick up on any device."),
        ...(o.sessions?.length ? [{ html: sessionsHtml(o.sessions), text: `Your live sessions:\n${sessionsText(o.sessions)}` }] : []),
      ),
      cta: { label: "Start learning", url: o.url },
    }),
  };
}

/** Refund confirmation (full or partial), sent once per refund. */
export function refundEmail(o: { name?: string | null; orderNumber: number; item: string; amount: string; full: boolean; invoiceUrl: string; method?: string | null }): Rendered {
  return {
    subject: `Your refund for order #${o.orderNumber}`,
    ...layout({
      preheader: `We've refunded ${o.amount}.`,
      heading: "Your refund is on its way",
      body: join(
        p(`Hi ${first(o.name)}, we've refunded ${o.amount} for ${o.item} (order #${o.orderNumber}).`),
        p(`The money goes back to the ${o.method ? o.method : "card or account you paid with"}. Depending on your bank it usually shows within 5–10 business days.`),
        o.full
          ? p("As this was a full refund, the course has been removed from your account.")
          : p("This was a partial refund, so your course access stays as it is."),
        { html: `<p style="margin:0 0 12px"><a href="${esc(o.invoiceUrl)}" style="color:${T.primary}">View your updated invoice</a></p>`, text: `Updated invoice: ${o.invoiceUrl}` },
      ),
      footer: "Questions about this refund? Just reply to this email.",
    }),
  };
}

/** Sent for providers where the buyer pays outside the site (bank transfer, payment link): how to finish paying. */
export function paymentPendingEmail(o: { name?: string | null; orderNumber: number; item: string; amount: string; provider: string; instructions?: string | null; payUrl: string }): Rendered {
  const box = {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:4px 0 16px;background:${T.surface};border-radius:12px">
<tr><td style="padding:12px 16px 4px;color:${T.muted}">Course</td><td align="right" style="padding:12px 16px 4px">${esc(o.item)}</td></tr>
<tr><td style="padding:4px 16px;color:${T.muted}">Payment method</td><td align="right" style="padding:4px 16px">${esc(o.provider)}</td></tr>
<tr><td style="padding:4px 16px;color:${T.muted}">Amount to pay</td><td align="right" style="padding:4px 16px;font-weight:700">${esc(o.amount)}</td></tr>
<tr><td style="padding:4px 16px 12px;color:${T.muted}">Payment reference</td><td align="right" style="padding:4px 16px 12px;font-family:monospace;font-weight:700">FC-${o.orderNumber}</td></tr></table>`,
    text: `Course: ${o.item}\nPayment method: ${o.provider}\nAmount to pay: ${o.amount}\nPayment reference: FC-${o.orderNumber}`,
  };
  return {
    subject: `Complete your payment for ${o.item}`,
    ...layout({
      preheader: `Pay ${o.amount} with reference FC-${o.orderNumber} to unlock your course.`,
      heading: "One step left",
      body: join(
        p(`Hi ${first(o.name)}, your order is reserved. There's one step left: complete your payment, and the course unlocks.`),
        box,
        ...(o.instructions ? [richText(o.instructions)] : []),
        p(`Please pay exactly ${o.amount} and include the reference FC-${o.orderNumber}, so we can match your payment. Your course unlocks as soon as it's confirmed, and your receipt is emailed to you.`),
      ),
      cta: { label: "Complete payment", url: o.payUrl },
      footer: "Already paid? You can ignore this email. Changed your mind? Nothing more is needed; the order lapses on its own.",
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

/** Plain text written by an admin → safe HTML paragraphs; blank lines split paragraphs, links become clickable. */
function richText(body: string): Block {
  const paras = body.replace(/\r/g, "").split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
  const link = (escaped: string) => escaped.replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" style="color:${T.text}">${u}</a>`);
  return {
    html: paras.map((x) => `<p style="margin:0 0 12px">${link(esc(x)).replace(/\n/g, "<br>")}</p>`).join(""),
    text: paras.join("\n\n"),
  };
}

/** Announcements, weekly updates and promotions written in the admin. {first_name} is replaced per student. */
export function messageEmail(o: {
  subject: string; heading: string; body: string; name?: string | null;
  cta?: { label: string; url: string } | null; footer?: string; unsubscribeUrl?: string;
}): Rendered {
  const personal = (x: string) => x.replace(/\{first_name\}/g, first(o.name));
  return {
    subject: personal(o.subject),
    ...layout({
      preheader: personal(o.body).replace(/\s+/g, " ").slice(0, 120),
      heading: personal(o.heading),
      body: richText(personal(o.body)),
      cta: o.cta ?? undefined,
      footer: o.footer,
      unsubscribeUrl: o.unsubscribeUrl,
    }),
  };
}

export function courseAccessEmail(o: { name?: string | null; course: string; url: string; until?: string | null }): Rendered {
  return {
    subject: `You now have access to ${o.course}`,
    ...layout({
      preheader: `${o.course} is ready in your FinCoursa account.`,
      heading: `Hi ${first(o.name)}, your course is ready`,
      body: join(
        p(`We've added ${o.course} to your FinCoursa account${o.until ? `. Your access runs until ${o.until}.` : " with lifetime access."}`),
        p("Sign in and start whenever you like. Your progress is saved as you go."),
      ),
      cta: { label: "Start the course", url: o.url },
    }),
  };
}

export function staffInviteEmail(o: { name?: string | null; role: "instructor" | "partner"; url: string }): Rendered {
  const what = o.role === "instructor"
    ? "Your instructor dashboard shows your courses, your students' progress, and your earnings and payouts."
    : "Your partner dashboard shows your referral link, the clients you've referred, and your commission and payouts.";
  return {
    subject: o.role === "instructor" ? "You've been added as a FinCoursa instructor" : "Your FinCoursa partner account is ready",
    ...layout({
      preheader: "Set up your account in one click.",
      heading: `Hi ${first(o.name)}, welcome to FinCoursa`,
      body: join(
        p(`FinCoursa Academy has set up ${o.role === "instructor" ? "an instructor" : "a partner"} account for you. ${what}`),
        p("Click the button and we'll email you a one-click sign-in link. No password needed; you can set one later in Settings."),
      ),
      cta: { label: "Set up my account", url: o.url },
      footer: "You're receiving this because FinCoursa added you to its team.",
    }),
  };
}
