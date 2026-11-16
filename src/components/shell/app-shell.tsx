"use client";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/auth-controls";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useTheme } from "next-themes";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Check, Menu, Moon, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  activePrimary,
  isActiveLink,
  primarySections,
  type PrimarySection,
} from "./navigation";

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

/** Level 1: primary sections (header on desktop, tab bar on mobile). */
function PrimaryNavigation({ variant }: { variant: "header" | "tabbar" }) {
  const pathname = usePathname();
  const current = activePrimary(pathname);
  return (
    <nav
      aria-label="Primary navigation"
      className={variant === "header" ? "primary-nav" : "primary-tabbar"}
    >
      <ul>
        {primarySections.map(({ id, href, title, icon: Icon }) => (
          <li key={id}>
            <Link
              href={href}
              aria-current={current.id === id ? "true" : undefined}
              className={cn(
                "primary-link",
                current.id === id && "primary-link-active",
              )}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SecondaryList({
  section,
  onNavigate,
}: {
  section: PrimarySection;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <ul className="nav-list">
      {section.links.map(({ href, title, icon: Icon, children }) => {
        const exact = !children;
        const active = isActiveLink(pathname, href, exact);
        return (
          <li key={href}>
            <Link
              href={href}
              onClick={onNavigate}
              aria-current={pathname === href ? "page" : undefined}
              className={cn("nav-link", active && "nav-link-active")}
            >
              <Icon size={19} aria-hidden="true" />
              {title}
              {pathname === href && (
                <span className="nav-dot" aria-hidden="true" />
              )}
            </Link>
            {children && active && (
              <ul className="nav-sublist">
                {children.map((child) => (
                  <li key={child.href}>
                    <Link
                      href={child.href}
                      onClick={onNavigate}
                      aria-current={
                        isActiveLink(pathname, child.href) ? "page" : undefined
                      }
                      className={cn(
                        "nav-sublink",
                        isActiveLink(pathname, child.href) &&
                          "nav-sublink-active",
                      )}
                    >
                      <child.icon size={15} aria-hidden="true" />
                      {child.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Level 2 on desktop: the sidebar for the active primary section. */
function SectionSidebar() {
  const section = activePrimary(usePathname());
  return (
    <nav aria-label="Main navigation">
      <p className="nav-caption">{section.caption}</p>
      <SecondaryList section={section} />
    </nav>
  );
}

/** Level 2 (and 3) on mobile: horizontally scrolling chips. */
function SectionChips() {
  const pathname = usePathname();
  const section = activePrimary(pathname);
  const parent = section.links.find(
    (l) => l.children && isActiveLink(pathname, l.href),
  );
  const rows = [
    section.links.map((l) => ({
      href: l.href,
      title: l.title,
      active: isActiveLink(pathname, l.href, !l.children),
    })),
    ...(parent?.children
      ? [
          parent.children.map((c) => ({
            href: c.href,
            title: c.title,
            active: isActiveLink(pathname, c.href),
          })),
        ]
      : []),
  ];
  if (rows[0]!.length < 2 && rows.length === 1) return null;
  return (
    <nav aria-label="Section navigation" className="section-chips">
      {rows.map((row, i) => (
        <ul key={i} className={i ? "chip-row chip-row-sub" : "chip-row"}>
          {row.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                className={cn("chip", item.active && "chip-active")}
              >
                {item.title}
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </nav>
  );
}

/** Mobile drawer: the full site map, grouped by primary section. */
function FullNavigation({ onNavigate }: { onNavigate: () => void }) {
  return (
    <nav aria-label="Main navigation">
      {primarySections.map((section) => (
        <div key={section.id} className="drawer-group">
          <p className="nav-caption">{section.title.toUpperCase()}</p>
          <SecondaryList section={section} onNavigate={onNavigate} />
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter() {
  return (
    <div className="sidebar-footer">
      <ShieldCheck size={20} aria-hidden="true" />
      <div>
        <strong>Private workspace</strong>
        <p>Identifiers you save are encrypted at rest.</p>
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
      <header className="app-header">
        <Brand />
        <PrimaryNavigation variant="header" />
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
                <FullNavigation onNavigate={() => setOpen(false)} />
                <SidebarFooter />
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </header>
      <div className="app-frame">
        <aside className="desktop-sidebar">
          <div className="sidebar-sticky">
            <SectionSidebar />
            <SidebarFooter />
          </div>
        </aside>
        <div className="app-body">
          <main id="main" tabIndex={-1} className="page-content">
            <SectionChips />
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
      <PrimaryNavigation variant="tabbar" />
    </div>
  );
}
