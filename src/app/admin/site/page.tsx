import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/dash/Stat";
import { getBranding, getIntroVideo } from "@/lib/site-settings";
import { brand } from "@/components/site/brand";
import { LogosAdmin, PartnersAdmin } from "./BrandingAdmin";
import { IntroVideoAdmin } from "./IntroVideoAdmin";

export const metadata: Metadata = { title: "Home page" };

export default async function SiteSettingsPage() {
  await requireRole(["admin"], "/admin/site");
  const [video, branding] = await Promise.all([getIntroVideo(), getBranding()]);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Home page</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">Logo, intro video and partner logos. Instructor photos and organisation logos are under Instructors; course and bundle images under Courses and Bundles.</p>
      </div>
      <Card title="Logo">
        <LogosAdmin branding={branding} />
      </Card>
      <Card title="Intro video">
        <IntroVideoAdmin video={video} />
      </Card>
      <Card title="Industry experts strip">
        <p className="-mt-1 mb-4 text-sm text-muted">The organisations scrolling under &ldquo;Industry experts&rdquo; on the home page.</p>
        <PartnersAdmin branding={branding} defaults={brand.partners.map((p) => p.name)} />
      </Card>
    </div>
  );
}
