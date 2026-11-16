"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import { showsInstitutionLogo } from "@/lib/wealth/catalog";
import type { Holding } from "@/lib/wealth/types";
import { cn } from "@/lib/utils";
import { rupees } from "./client";
import { InstitutionLogo } from "./institution-logo";
import { categoryOf } from "./summary";

/**
 * Accessible single-select listbox for choosing an owned bank/cash account,
 * styled like the other form controls and showing each account's mark,
 * masked number and current balance (the native <select> can't).
 */
export function AccountPicker({
  id,
  accounts,
  value,
  onChange,
  invalid,
  describedBy,
  emptyLabel = "Not recorded",
}: {
  id: string;
  accounts: Holding[];
  value: string;
  onChange: (id: string) => void;
  invalid?: boolean;
  describedBy?: string;
  emptyLabel?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const options = [null, ...accounts];
  const selectedIndex = Math.max(
    0,
    options.findIndex((o) => (o?.id ?? "") === value),
  );
  const [active, setActive] = useState(selectedIndex);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const selected = options[selectedIndex] ?? null;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function choose(index: number) {
    onChange(options[index]?.id ?? "");
    setOpen(false);
    button.current?.focus();
  }
  function onKey(event: KeyboardEvent) {
    const last = options.length - 1;
    const move = (to: number) => {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(selectedIndex);
        return;
      }
      setActive(Math.min(last, Math.max(0, to)));
    };
    switch (event.key) {
      case "ArrowDown":
        return move(active + 1);
      case "ArrowUp":
        return move(active - 1);
      case "Home":
        return move(0);
      case "End":
        return move(last);
      case "Enter":
      case " ":
        event.preventDefault();
        if (open) choose(active);
        else {
          setActive(selectedIndex);
          setOpen(true);
        }
        return;
      case "Escape":
        if (open) {
          event.preventDefault();
          setOpen(false);
        }
        return;
      case "Tab":
        setOpen(false);
    }
  }

  const row = (h: Holding | null, compact = false) =>
    h ? (
      <>
        <InstitutionLogo
          name={
            showsInstitutionLogo(categoryOf(h))
              ? (h.institution ?? h.name)
              : null
          }
          institutionKey={h.institutionKey}
          icon={categoryOf(h).icon}
          kinds={categoryOf(h).institutionKinds}
          size={compact ? 26 : 30}
        />
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate font-medium">{h.name}</span>
          {!compact && (
            <span className="block truncate text-xs text-muted-foreground">
              {[
                categoryOf(h).singular,
                h.secretMasks.accountNumber,
                h.archived ? "Archived" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
        </span>
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {rupees(h.balanceMinor)}
        </span>
      </>
    ) : (
      <span className="flex-1 text-left text-muted-foreground">
        {emptyLabel}
      </span>
    );

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className="picker-trigger"
        onClick={() => {
          setActive(selectedIndex);
          setOpen((o) => !o);
        }}
        onKeyDown={onKey}
      >
        {row(selected, true)}
        <ChevronDown
          size={16}
          aria-hidden="true"
          className={cn(
            "shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <ul id={listId} role="listbox" className="picker-list" tabIndex={-1}>
          {options.map((h, i) => (
            <li
              key={h?.id ?? "none"}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === selectedIndex}
              className={cn(
                "picker-option",
                i === active && "picker-option-active",
              )}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(i)}
            >
              {row(h)}
              <Check
                size={15}
                aria-hidden="true"
                className={cn(
                  "shrink-0 text-primary",
                  i !== selectedIndex && "invisible",
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
