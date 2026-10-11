import { Logo } from "@/components/site/Logo";
import { assetUrl } from "@/lib/assets";
import Link from "next/link";
import type { Instructor } from "@/lib/catalog";

/** Tall portrait card with a thin lime edge, organisation logo, name and title over the photo. */
export function FacultyCard({ person }: { person: Instructor }) {
  return (
    <Link href={`/instructors/${person.slug}`}
      className="group relative block aspect-[338/460] overflow-hidden rounded-2xl border border-accent/60 bg-[#14100c] [border-bottom-color:transparent]">
      {person.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={assetUrl(person.photo_url)} alt={person.name} className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
      ) : (
        // No photo yet: FinCoursa logo on white, as on fincoursa.com
        <div className="absolute inset-0 flex items-start justify-center bg-white px-6 pt-[30%]">
          <Logo tone="dark" className="w-full" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 via-35% to-transparent to-60%" />
      <div className="absolute inset-x-4 bottom-4 text-white">
        {person.org_logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assetUrl(person.org_logo_url)} alt="" className="mb-4 h-6 w-auto max-w-[70%] object-contain object-left" />
        )}
        <hr className="mb-4 w-2/3 border-white/80" />
        <h3 className="text-xl font-medium tracking-tight">{person.name}</h3>
        {person.title && <p className="mt-1 text-sm leading-relaxed">{person.title}</p>}
      </div>
    </Link>
  );
}
