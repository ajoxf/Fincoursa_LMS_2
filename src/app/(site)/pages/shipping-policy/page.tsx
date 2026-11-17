import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata: Metadata = { title: "Shipping & Delivery Policy", alternates: { canonical: "/pages/shipping-policy" } };

export default function Page() {
  return <LegalPage kind="delivery" />;
}
