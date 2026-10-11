import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { Card } from "@/components/dash/Stat";
import { getIntroVideo } from "@/lib/site-settings";
import { IntroVideoAdmin } from "./IntroVideoAdmin";

export const metadata: Metadata = { title: "Home page" };

export default async function SiteSettingsPage() {
  await requireRole(["admin"], "/admin/site");
  const video = await getIntroVideo();
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-3xl font-bold text-primary">Home page</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">Change what visitors see on the home page.</p>
      </div>
      <Card title="Intro video">
        <IntroVideoAdmin video={video} />
      </Card>
    </div>
  );
}
