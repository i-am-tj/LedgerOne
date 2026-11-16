// Three-level information architecture:
// Primary nav (header) → Secondary nav (sidebar / chips) → Page content.
import {
  Activity,
  ArrowLeftRight,
  LayoutDashboard,
  LayoutGrid,
  Layers3,
  Palette,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  categoryHref,
  sectionCategories,
  sections,
} from "@/lib/wealth/catalog";
import { wealthIcon } from "@/components/wealth/icons";

export type SecondaryLink = {
  href: string;
  title: string;
  icon: LucideIcon;
  /** Nested third-level links shown under the active secondary item. */
  children?: { href: string; title: string; icon: LucideIcon }[];
};
export type PrimarySection = {
  id: "feed" | "wealth" | "cashflow" | "hub";
  title: string;
  href: string;
  icon: LucideIcon;
  caption: string;
  match: string[];
  links: SecondaryLink[];
};

export const primarySections: PrimarySection[] = [
  {
    id: "feed",
    title: "Feed",
    href: "/home",
    icon: Activity,
    caption: "YOUR FEED",
    match: ["/home"],
    links: [{ href: "/home", title: "Overview", icon: LayoutDashboard }],
  },
  {
    id: "wealth",
    title: "Wealth",
    href: "/wealth/liquid",
    icon: Wallet,
    caption: "WEALTH PORTFOLIOS",
    match: ["/wealth"],
    links: sections.map((s) => ({
      href: `/wealth/${s.id}`,
      title: s.label,
      icon: wealthIcon(s.icon),
      children: sectionCategories(s.id).map((c) => ({
        href: categoryHref(c),
        title: c.label,
        icon: wealthIcon(c.icon),
      })),
    })),
  },
  {
    id: "cashflow",
    title: "Cashflow",
    href: "/transactions",
    icon: ArrowLeftRight,
    caption: "CASHFLOW",
    match: ["/transactions"],
    links: [
      { href: "/transactions", title: "Transactions", icon: ArrowLeftRight },
    ],
  },
  {
    id: "hub",
    title: "Hub",
    href: "/accounts",
    icon: LayoutGrid,
    caption: "HUB",
    match: ["/accounts", "/settings", "/design-system"],
    links: [
      { href: "/accounts", title: "Accounts", icon: Layers3 },
      { href: "/settings/appearance", title: "Appearance", icon: Palette },
      { href: "/design-system", title: "Component library", icon: Layers3 },
    ],
  },
];

const within = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(href + "/");

export function activePrimary(pathname: string) {
  return (
    primarySections.find((s) => s.match.some((m) => within(pathname, m))) ??
    primarySections[0]!
  );
}
/** Secondary links are active for their whole subtree (e.g. /wealth/liquid/…). */
export function isActiveLink(pathname: string, href: string, exact = false) {
  return exact ? pathname === href : within(pathname, href);
}
