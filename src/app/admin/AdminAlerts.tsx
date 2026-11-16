import { getSessionUser, hasRole } from "@/lib/auth";
import { openOrderAlerts } from "@/lib/alerts";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { completeStuckOrder } from "./actions";

/** Shown on every admin page while an order has taken money (or a 100% code) without enrolling the buyer. */
export async function AdminAlerts() {
  const user = await getSessionUser();
  if (!hasRole(user, "admin") && !hasRole(user, "finance")) return null;
  const alerts = await openOrderAlerts().catch(() => []);
  if (!alerts.length) return null;
  return (
    <div role="alert" className="mb-6 grid gap-3 rounded-xl border-2 border-danger bg-danger/5 p-4 text-sm">
      <p className="font-bold text-danger">{alerts.length === 1 ? "1 order needs your attention" : `${alerts.length} orders need your attention`}: the buyer wasn&apos;t enrolled</p>
      <ul className="grid gap-2">
        {alerts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-3">
            <span className="min-w-0">
              <b>Order #{a.number}</b> · {a.item || "order"} · {a.total_minor ? formatMoney(a.total_minor, a.currency) : "free with a code"} · {a.email ?? "unknown buyer"} · {formatDate(a.created_at, "datetime")}
              <span className="block text-xs text-muted">{a.problem}</span>
            </span>
            {a.gateway === "free" || !a.total_minor
              ? <form action={completeStuckOrder.bind(null, a.id)}><button className="fc-btn fc-btn-primary !min-w-0 !px-4 !py-2 text-sm">Complete enrolment</button></form>
              : <a href="/admin/orders" className="fc-btn fc-btn-outline !min-w-0 !px-4 !py-2 text-sm text-ink">Check payment and mark paid</a>}
          </li>
        ))}
      </ul>
    </div>
  );
}
