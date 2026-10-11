import { assetUrl } from "@/lib/assets";
import Link from "next/link";
import type { Instructor } from "@/lib/catalog";

/** Wide photo banner for the course's instructor, with a "Know More" link to their page. */
export function FacultyBanner({ person }: { person: Instructor }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#14100c]">
      {person.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(person.photo_url)} alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_20%]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/30 to-transparent" />
      <div className="relative px-8 pb-24 pt-24 text-white md:pt-[100px]">
        <div className="flex gap-4">
          <span className="fc-pill fc-pill-dark !py-0.5 text-xs">The Faculty</span>
          <span className="fc-pill fc-pill-dark !py-0.5 text-xs">Verified</span>
        </div>
        <h2 className="fc-display mt-5 text-5xl md:text-[72px]">{person.name}</h2>
        {person.title && <p className="mt-3 text-[15px]">{person.title}</p>}
        <Link href={`/instructors/${person.slug}`} className="fc-btn fc-btn-primary mt-5 !min-w-0 !px-10 !py-4">Know More</Link>
      </div>
    </div>
  );
}
