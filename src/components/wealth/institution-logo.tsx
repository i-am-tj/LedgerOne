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

/**
 * Static app/institution mark. Known banks, apps and fund houses render their
 * brand-coloured monogram; unknown names get a deterministic generated mark;
 * with no name the category icon is used. Nothing is fetched remotely.
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
  const style = { width: size, height: size, fontSize: size * 0.34 };
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
