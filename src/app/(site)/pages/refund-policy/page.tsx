import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata: Metadata = { title: "Refund & Cancellation Policy", alternates: { canonical: "/pages/refund-policy" } };

export default function Page() {
  return <LegalPage kind="refunds" />;
}
