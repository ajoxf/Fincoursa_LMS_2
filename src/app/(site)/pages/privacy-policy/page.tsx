import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

// TODO(migration): paste the current text from fincoursa.com/pages/privacy-policy
export default function Page() {
  return (
    <article className="fc-container max-w-3xl py-20">
      <h1 className="text-4xl font-bold text-primary">Privacy Policy</h1>
      <p className="mt-6 text-muted">This page will carry the same text as the current site.</p>
    </article>
  );
}
