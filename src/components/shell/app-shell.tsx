"use client";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/auth-controls";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme } from "next-themes";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  Check,
  Layers3,
  LayoutDashboard,
  Menu,
  Moon,
  Palette,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/home", title: "Overview", icon: LayoutDashboard },
  { href: "/accounts", title: "Accounts", icon: Layers3 },
  { href: "/transactions", title: "Transactions", icon: Layers3 },
  { href: "/settings/appearance", title: "Appearance", icon: Palette },
  { href: "/design-system", title: "Component library", icon: Layers3 },
];
function Brand() {
  return (
    <Link href="/home" className="brand" aria-label="LedgerOne home">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        Ledger<span className="font-normal">One</span>
        <small>PERSONAL FINANCE</small>
      </span>
    </Link>
  );
}
function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation">
      <p className="nav-caption">YOUR WORKSPACE</p>
      <ul className="nav-list">
        {links.map(({ href, title, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={pathname === href ? "page" : undefined}
              className={cn("nav-link", pathname === href && "nav-link-active")}
            >
              <Icon size={19} aria-hidden="true" />
              {title}
              {pathname === href && (
                <span className="nav-dot" aria-hidden="true" />
              )}
            </Link>
          </li>
        ))}
      </ul>
      <div className="upcoming-nav">
        <p className="nav-caption">COMING NEXT</p>
        <ul>
          <li>Budgets & insights</li>
        </ul>
      </div>
    </nav>
  );
}
function SidebarFooter() {
  return (
    <div className="sidebar-footer">
      <ShieldCheck size={20} aria-hidden="true" />
      <div>
        <strong>Built with care</strong>
        <p>Your financial workspace is taking shape.</p>
        <SignOutButton />
      </div>
    </div>
  );
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <div className="app-shell">
      <aside className="desktop-sidebar">
        <Brand />
        <Navigation />
        <SidebarFooter />
      </aside>
      <div className="app-body">
        <header className="app-header">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="desktop-header-label">
            <span className="status-dot" aria-hidden="true" />A thoughtful start
            to better money habits
          </div>
          <div className="header-actions">
            <span className="environment-badge">
              <Check size={12} aria-hidden="true" />
              Private workspace
            </span>
            <Button
              variant="ghost"
              className="icon-button"
              aria-label="Toggle color theme"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              <Moon aria-hidden="true" />
            </Button>
            <Dialog.Root open={open} onOpenChange={setOpen}>
              <Dialog.Trigger asChild>
                <Button
                  variant="outline"
                  className="mobile-menu icon-button"
                  aria-label="Open navigation"
                >
                  <Menu aria-hidden="true" />
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="menu-overlay" />
                <Dialog.Content className="mobile-drawer">
                  <div className="flex items-center justify-between gap-4">
                    <Dialog.Title className="text-xl font-semibold">
                      Your workspace
                    </Dialog.Title>
                    <Dialog.Close asChild>
                      <Button
                        variant="ghost"
                        className="icon-button"
                        aria-label="Close navigation"
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </Dialog.Close>
                  </div>
                  <Dialog.Description className="mt-2 mb-7 text-sm text-muted-foreground">
                    Navigate LedgerOne and customize your experience.
                  </Dialog.Description>
                  <Navigation onNavigate={() => setOpen(false)} />
                  <SidebarFooter />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="page-content">
          {children}
        </main>
        <footer className="app-footer">
          <span>
            LedgerOne <span aria-hidden="true">/</span> A clearer financial
            life.
          </span>
          <Link href="/settings/appearance">
            Make it yours <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </div>
  );
}
