import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata: Metadata = { title: "Terms & Conditions" };

export default function Page() {
  return <LegalPage kind="terms" />;
}
