// Brand assets currently hosted on the Thinkific CDN. Re-host in /public or Supabase Storage before cut-over.
const CDN = "https://import.cdn.thinkific.com/1229196/custom_site_themes/id";
export const brand = {
  name: "FinCoursa Academy",
  logoHeader: `${CDN}/nheg0rh2QRqGIOXG8FBU_header-logo.png`,
  logoFooter: `${CDN}/K7xJCUqTUCsenKNBD5zw_header-logo.png`,
  // Poster under the home hero until an intro video (NEXT_PUBLIC_INTRO_PLAYBACK_ID) is set
  heroPoster: `${CDN}/HuQCUF6DRo2ypIjWDair_Gemini_Generated_Image_321uby321uby321u.jpg`,
  partners: [
    { name: "OKX", src: `${CDN}/zOnIy1ltQHim7zms8hpf_OKX_wordmark_black.png` },
    { name: "Kase and Company", src: `${CDN}/cytupqSQQ9yhMbB0GxBW_kase_logo_black_1x.png` },
    { name: "Bloomberg", src: `${CDN}/LMCVTGJ1Sdu467ljPJyx_bloomberg_wordmark_bold_1x.png` },
  ],
};
