// Brand assets. The old Thinkific CDN copies are gone (the CDN returns AccessDenied), so until the real
// files are added under /public/brand the site shows a text wordmark and partner names as text.
// To switch to the image files: put them in /public/brand and set the paths below.
export const brand = {
  name: "FinCoursa Academy",
  /** Dark logo for light backgrounds, e.g. "/brand/logo-dark.png" */
  logoHeader: null as string | null,
  /** White logo for dark backgrounds, e.g. "/brand/logo-white.png" */
  logoFooter: null as string | null,
  /** Poster under the home hero until an intro video (NEXT_PUBLIC_INTRO_PLAYBACK_ID) is set */
  heroPoster: null as string | null,
  partners: [
    { name: "Kase and Company, Inc.", src: null as string | null, style: "font-normal" },
    { name: "Bloomberg", src: null as string | null, style: "font-bold tracking-tight" },
    { name: "OKX", src: null as string | null, style: "font-black tracking-[0.2em]" },
  ],
};
