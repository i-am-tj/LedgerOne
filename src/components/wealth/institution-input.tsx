"use client";
import { useId, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import {
  institutionSuggestions,
  type Institution,
  type InstitutionKind,
} from "@/lib/wealth/institutions";
import { cn } from "@/lib/utils";
import { InstitutionLogo } from "./institution-logo";

const kindLabel: Partial<Record<InstitutionKind, string>> = {
  bank: "Bank",
  "small-finance-bank": "Small finance bank",
  neobank: "Digital bank",
  "post-office": "Post office",
  nbfc: "NBFC",
  "card-issuer": "Card issuer",
  platform: "Investment app",
  broker: "Broker",
  amc: "Fund house",
  pension: "Pension",
  bullion: "Bullion",
  government: "Government",
};

/**
 * Free-text institution field with suggestions limited to the kinds that make
 * sense for this holding type (banks for a savings account, fund houses for a
 * mutual fund…). Implements the ARIA combobox/listbox autocomplete pattern.
 */
export function InstitutionInput({
  id,
  value,
  onChange,
  kinds,
  placeholder,
  selectedKey,
  invalid,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  kinds: readonly InstitutionKind[];
  placeholder?: string;
  selectedKey?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const exact = value.trim() !== "" && selectedKey;
  const options: Institution[] = kinds.length
    ? institutionSuggestions(kinds, exact ? "" : value).slice(0, 40)
    : [];
  const showList = open && options.length > 0;

  function choose(option: Institution) {
    onChange(option.name);
    setOpen(false);
    setActive(-1);
  }
  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (!options.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((a) =>
        event.key === "ArrowDown"
          ? Math.min(options.length - 1, a + 1)
          : Math.max(0, a - 1),
      );
    } else if (event.key === "Enter" && showList && active >= 0) {
      event.preventDefault();
      choose(options[active]!);
    } else if (event.key === "Escape" && showList) {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={
          showList && active >= 0 ? `${listId}-${active}` : undefined
        }
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="flex min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground aria-invalid:border-destructive"
        maxLength={120}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={onKey}
      />
      {showList && (
        <ul id={listId} role="listbox" className="picker-list">
          {options.map((o, i) => (
            <li
              key={o.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.key === selectedKey}
              className={cn(
                "picker-option",
                i === active && "picker-option-active",
              )}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
            >
              <InstitutionLogo
                name={o.name}
                institutionKey={o.key}
                icon="building"
                size={28}
              />
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {kindLabel[o.kind]}
              </span>
              <Check
                size={15}
                aria-hidden="true"
                className={cn(
                  "shrink-0 text-primary",
                  o.key !== selectedKey && "invisible",
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
