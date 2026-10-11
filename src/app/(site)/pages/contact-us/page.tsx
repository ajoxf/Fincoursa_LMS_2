import type { Metadata } from "next";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = { title: "Contact" };

// Optional scheduling page (e.g. a Calendly link) shown inside the "Book a call" panel
const bookingUrl = process.env.NEXT_PUBLIC_BOOKING_URL;

export default function ContactPage() {
  return (
    <section className="bg-surface">
      <div className="fc-container grid gap-10 py-24 lg:grid-cols-2">
        <div className="flex min-h-[634px] flex-col rounded-3xl bg-black p-8 text-white">
          <span className="fc-pill fc-pill-dark self-start">Contact us</span>
          <h1 className="fc-h2 mt-4">Book a call with a <span className="text-accent">Program Advisor.</span></h1>
          {bookingUrl && <iframe src={bookingUrl} title="Book a call" className="mt-6 w-full flex-1 rounded-xl bg-white" />}
        </div>
        <div className="rounded-3xl bg-white p-8">
          <span className="fc-pill">General</span>
          <h2 className="fc-h2 mt-4 text-ink">Not sure where to start?</h2>
          <p className="mt-4 text-[15px] leading-relaxed text-ink/90">Send us a note and a program advisor will point you to the right track or bundle.</p>
          <ContactForm />
        </div>
      </div>
    </section>
  );
}
