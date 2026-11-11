import { requirePageSession } from "@/lib/auth/server";
import type { Metadata } from "next";
import { AppearanceSettings } from "@/components/shell/appearance-settings";
export const metadata: Metadata = { title: "Appearance" };
export default async function AppearancePage() {
  await requirePageSession();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MAKE IT YOURS</p>
          <h1>A workspace that feels right.</h1>
          <p className="page-description">
            A little more light. A little less glare. Your choice.
          </p>
        </div>
      </div>
      <AppearanceSettings />
      <p className="mt-6 text-sm text-muted-foreground">
        Theme preferences apply to this browser only. They don’t change any
        financial records.
      </p>
    </>
  );
}
