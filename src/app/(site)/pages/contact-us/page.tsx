import type { Metadata } from "next";
import { ContactForm } from "./ContactForm";
import { PageHero } from "@/components/site/PageHero";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <>
      <PageHero label="Contact" title="Talk to our Team">
        <p className="mt-6 max-w-[560px] text-[15px] leading-relaxed">Corporate, university or fully custom — tell us your goals and we&apos;ll scope a program that fits. One conversation, one team to work with.</p>
      </PageHero>
      <section className="bg-surface">
        <div className="fc-container py-20">
          <div className="mx-auto max-w-[720px] rounded-2xl bg-white p-6 md:p-10"><ContactForm /></div>
        </div>
      </section>
    </>
  );
}
