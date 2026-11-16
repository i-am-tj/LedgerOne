"use client";
import { useState } from "react";
import logoManifest from "@/lib/wealth/logo-manifest.json";
import {
  generatedMark,
  institutionByKey,
  matchInstitution,
} from "@/lib/wealth/institutions";
import { cn } from "@/lib/utils";
import { wealthIcon } from "./icons";

export function resolveInstitution(
  name: string | null | undefined,
  key?: string | null,
) {
  return institutionByKey(key) ?? matchInstitution(name);
}

const logos: Record<string, string> = logoManifest;

/**
 * Institution / app mark. Known brands render their official icon from
 * public/institutions (see `npm run logos:fetch`), falling back to a
 * brand-coloured monogram if the file is missing or fails to load; unknown
 * names get a generated mark; with no name the category icon is used.
 */
export function InstitutionLogo({
  name,
  institutionKey,
  icon,
  size = 44,
  className,
}: {
  name?: string | null;
  institutionKey?: string | null;
  icon: string;
  size?: number;
  className?: string;
}) {
  const known = resolveInstitution(name, institutionKey);
  const [broken, setBroken] = useState<string | null>(null);
  const style = { width: size, height: size, fontSize: size * 0.34 };
  const logo = known ? logos[known.key] : undefined;
  if (known && logo && broken !== logo)
    return (
      <span
        className={cn(
          "institution-logo institution-logo-image",
          logo.endsWith(".jpg") && "institution-logo-cover",
          className,
        )}
        style={style}
        title={known.name}
        aria-hidden="true"
      >
        {/* Local static asset; next/image adds nothing for tiny icons. */}
        <img src={logo} alt="" loading="lazy" onError={() => setBroken(logo)} />
      </span>
    );
  if (known)
    return (
      <span
        className={cn("institution-logo", className)}
        style={{
          ...style,
          background: known.background,
          color: known.foreground ?? "#fff",
          fontSize: known.mark.length > 2 ? size * 0.26 : size * 0.36,
        }}
        title={known.name}
        aria-hidden="true"
      >
        {known.mark}
      </span>
    );
  if (name?.trim()) {
    const g = generatedMark(name);
    return (
      <span
        className={cn("institution-logo", className)}
        style={{ ...style, background: g.background, color: "#fff" }}
        aria-hidden="true"
      >
        {g.mark}
      </span>
    );
  }
  const Icon = wealthIcon(icon);
  return (
    <span
      className={cn("institution-logo institution-logo-icon", className)}
      style={style}
      aria-hidden="true"
    >
      <Icon size={size * 0.45} />
    </span>
  );
}
