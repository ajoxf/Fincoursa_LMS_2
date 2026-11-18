/**
 * CMT Association Participating Prep Provider (PPP) status: approved and listed (18 Nov 2026). Before approval
 * confirms the listing, the site must not claim the status or show the badge. When approved, set APPROVED to true and
 * add the badge the Association sent as /public/cmt-ppp-badge.png (BADGE below).
 * Wording rule from the Association: state the status accurately and never imply endorsement, authorisation,
 * accreditation or exclusivity (so never "official" or "authorised").
 */
export const CMT_PPP = {
  APPROVED: true,
  BADGE: "/cmt-ppp-badge.png" as string | null, // the official badge the CMT Association sent
  STATUS: "FinCoursa is a CMT Association Participating Prep Provider.",
  DISCLAIMER_APPROVED:
    "FinCoursa is a CMT Association Participating Prep Provider. This does not mean the CMT Association endorses, authorises, accredits or reviews FinCoursa's products or services, and FinCoursa is not an exclusive provider. FinCoursa materials are our own. CMT® and Chartered Market Technician® are trademarks of the CMT Association, used to describe the exams our materials prepare for.",
  DISCLAIMER_PENDING:
    "FinCoursa materials are our own and are not reviewed or endorsed by the CMT Association. CMT® and Chartered Market Technician® are trademarks of the CMT Association, used to describe the exams our materials prepare for.",
};
export const cmtDisclaimer = () => (CMT_PPP.APPROVED ? CMT_PPP.DISCLAIMER_APPROVED : CMT_PPP.DISCLAIMER_PENDING);
