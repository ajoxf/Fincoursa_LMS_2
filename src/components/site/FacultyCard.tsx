import type { Instructor } from "@/lib/catalog";

export function FacultyCard({ person }: { person: Instructor }) {
  return (
    <div className="overflow-hidden rounded-card bg-white/5 ring-1 ring-white/10">
      <div className="aspect-[4/5] bg-white/10">
        {person.photo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.photo_url} alt={person.name} className="h-full w-full object-cover" />
        )}
      </div>
      <div className="flex items-end justify-between gap-4 p-5">
        <div>
          <h3 className="text-lg font-semibold text-white">{person.name}</h3>
          {person.title && <p className="mt-1 text-sm text-on-dark/75">{person.title}</p>}
        </div>
        {person.org_logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={person.org_logo_url} alt="" className="h-6 w-auto opacity-90" />
        )}
      </div>
    </div>
  );
}
