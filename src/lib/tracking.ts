import "server-only";
import { cache } from "react";
import { getSetting } from "@/lib/site-settings";

/** Admin → Ads & tracking. Stored in site_settings under "tracking". */
export type TrackingSettings = {
  /** LinkedIn Insight Tag partner id (Campaign Manager → Analyze → Insight Tag), digits only */
  linkedin_partner_id: string | null;
  /** LinkedIn conversion ids (Campaign Manager → Analyze → Conversion tracking) */
  linkedin_signup_conversion_id: string | null;
  linkedin_purchase_conversion_id: string | null;
  /** the FinCoursa Company Page, e.g. https://www.linkedin.com/company/123456/ (used for "Open LinkedIn" on posts) */
  linkedin_page_url?: string | null;
  /** how posts look in the preview */
  linkedin_page_name?: string | null;
  linkedin_page_logo_url?: string | null;
  linkedin_page_followers?: string | null;
  linkedin_profile_name?: string | null;
  linkedin_profile_headline?: string | null;
};

export const TRACKING_DEFAULTS: TrackingSettings = {
  linkedin_partner_id: null, linkedin_signup_conversion_id: null, linkedin_purchase_conversion_id: null,
};

export const getTracking = cache(async (): Promise<TrackingSettings> =>
  ({ ...TRACKING_DEFAULTS, ...((await getSetting<Partial<TrackingSettings>>("tracking")) ?? {}) }));
