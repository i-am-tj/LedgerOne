import { requirePageSession } from "@/lib/auth/server";
import { AppShell } from "@/components/shell/app-shell";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageSession();
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <AppShell>{children}</AppShell>
    </>
  );
}
