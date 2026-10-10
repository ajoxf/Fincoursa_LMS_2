import type { Metadata } from "next";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <section className="fc-container grid gap-12 py-20 lg:grid-cols-2">
      <div>
        <p className="fc-label">Contact</p>
        <h1 className="mt-2 text-4xl font-bold text-primary">Talk to our Team</h1>
        <p className="mt-4 text-muted">Corporate, university or fully custom — tell us your goals and we&apos;ll scope a program that fits. One conversation, one team to work with.</p>
      </div>
      <ContactForm />
    </section>
  );
}
