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
};

export const TRACKING_DEFAULTS: TrackingSettings = {
  linkedin_partner_id: null, linkedin_signup_conversion_id: null, linkedin_purchase_conversion_id: null,
};

export const getTracking = cache(async (): Promise<TrackingSettings> =>
  ({ ...TRACKING_DEFAULTS, ...((await getSetting<Partial<TrackingSettings>>("tracking")) ?? {}) }));
