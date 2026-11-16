"use client";
import Link from "next/link";
import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BarChart3, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  categoryHref,
  findCategory,
  findSection,
  sectionCategories,
  type CategoryDef,
  type SectionId,
} from "@/lib/wealth/catalog";
import type { Holding } from "@/lib/wealth/types";
import { cn } from "@/lib/utils";
import { rupees, useWealth } from "./client";
import { InstitutionLogo } from "./institution-logo";
import { wealthIcon } from "./icons";
import { categoryOf, holdingFacts, netWorthMinor } from "./summary";

export function holdingHref(h: Holding) {
  const c = categoryOf(h);
  return `${categoryHref(c)}/${h.id}`;
}

function LoadState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return error ? (
    <div role="alert" className="notice notice-error">
      <div>
        <strong>Couldn’t load your wealth</strong>
        <p>{error}</p>
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </div>
  ) : (
    <p role="status" className="text-muted-foreground">
      Loading your wealth…
    </p>
  );
}

function AddPicker({
  section,
  label = "Add asset",
}: {
  section: SectionId;
  label?: string;
}) {
  const info = findSection(section)!;
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button>
          <Plus aria-hidden="true" />
          {label}
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="menu-overlay" />
        <Dialog.Content className="picker-dialog">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-semibold">
                Add to {info.label}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                Choose what you’d like to track. Each type has its own details.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button
                variant="ghost"
                className="icon-button"
                aria-label="Close"
              >
                <X aria-hidden="true" />
              </Button>
            </Dialog.Close>
          </div>
          <ul className="picker-grid">
            {sectionCategories(section).map((c) => {
              const Icon = wealthIcon(c.icon);
              return (
                <li key={c.id}>
                  <Link href={categoryHref(c) + "/new"} className="picker-tile">
                    <span className="picker-icon">
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <span>
                      <strong>{c.singular}</strong>
                      <small>{c.description}</small>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NetWorth({
  holdings,
  section,
}: {
  holdings: Holding[];
  section: SectionId;
}) {
  return (
    <Card className="networth-card">
      <div>
        <p className="eyebrow">TOTAL NET WORTH</p>
        <p className="networth-value">{rupees(netWorthMinor(holdings))}</p>
        <p className="text-sm text-muted-foreground">
          Assets less liabilities across every portfolio.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" asChild>
          <Link href="/accounts">
            <BarChart3 aria-hidden="true" />
            Ledger
          </Link>
        </Button>
        <AddPicker section={section} />
      </div>
    </Card>
  );
}

export function HoldingCard({ holding }: { holding: Holding }) {
  const c = categoryOf(holding);
  const f = holdingFacts(holding);
  return (
    <Link href={holdingHref(holding)} className="holding-card">
      <div className="flex items-start gap-3">
        <InstitutionLogo
          name={holding.institution ?? holding.name}
          institutionKey={holding.institutionKey}
          icon={c.icon}
        />
        <div className="min-w-0 flex-1">
          <p className="holding-name">{holding.name}</p>
          <p className="holding-sub">{f.subtitle.join(" • ")}</p>
        </div>
        <ChevronRight
          size={18}
          aria-hidden="true"
          className="text-muted-foreground"
        />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">{f.valueLabel}</p>
      <p className="holding-value">{f.value}</p>
      {f.extra && (
        <p
          className={cn(
            "mt-1 text-xs",
            f.extra.tone === "up" && "text-up",
            f.extra.tone === "down" && "text-down",
            !f.extra.tone && "text-muted-foreground",
          )}
        >
          {f.extra.label}: {f.extra.value}
        </p>
      )}
      {holding.archived && <span className="subtle-badge mt-3">Archived</span>}
    </Link>
  );
}

export function HoldingRow({ holding }: { holding: Holding }) {
  const c = categoryOf(holding);
  const f = holdingFacts(holding);
  return (
    <li>
      <Link href={holdingHref(holding)} className="holding-row">
        <InstitutionLogo
          name={holding.institution ?? holding.name}
          institutionKey={holding.institutionKey}
          icon={c.icon}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <p className="holding-name">
            {holding.name}
            {holding.archived && (
              <span className="subtle-badge ml-2">Archived</span>
            )}
          </p>
          <p className="holding-sub">{f.subtitle.join(" • ")}</p>
        </div>
        <div className="holding-row-value">
          <p className="text-xs text-muted-foreground">{f.valueLabel}</p>
          <p className="font-semibold tabular-nums">{f.value}</p>
          {f.extra && (
            <p
              className={cn(
                "text-xs",
                f.extra.tone === "up" && "text-up",
                f.extra.tone === "down" && "text-down",
                !f.extra.tone && "text-muted-foreground",
              )}
            >
              {f.extra.tone
                ? f.extra.value
                : `${f.extra.label} ${f.extra.value}`}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}

const asCards = (c: CategoryDef) =>
  ["savings", "current", "cash", "credit-cards"].includes(c.id);

function CategoryGroup({
  category,
  holdings,
}: {
  category: CategoryDef;
  holdings: Holding[];
}) {
  const id = `group-${category.id}`;
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <div className="group-heading">
        <h2 id={id}>{category.label}</h2>
        <Link
          href={categoryHref(category)}
          className="text-sm underline-offset-4 hover:underline"
        >
          View all
        </Link>
      </div>
      {asCards(category) ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {holdings.map((h) => (
            <HoldingCard key={h.id} holding={h} />
          ))}
        </div>
      ) : (
        <ul className="holding-list">
          {holdings.map((h) => (
            <HoldingRow key={h.id} holding={h} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ArchivedToggle({
  show,
  onChange,
  count,
}: {
  show: boolean;
  onChange: (v: boolean) => void;
  count: number;
}) {
  if (!count) return null;
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <input
        type="checkbox"
        className="size-4"
        checked={show}
        onChange={(e) => onChange(e.target.checked)}
      />
      Show archived ({count})
    </label>
  );
}

export function WealthSection({ section }: { section: SectionId }) {
  const { data, error, reload } = useWealth();
  const [archived, setArchived] = useState(false);
  const info = findSection(section)!;
  const categories = sectionCategories(section);
  const inSection = (data?.holdings ?? []).filter(
    (h) => findCategory(h.category)?.section === section,
  );
  const visible = inSection.filter((h) => archived || !h.archived);
  const total = visible.reduce((s, h) => s + BigInt(h.balanceMinor), 0n);
  return (
    <div className="grid gap-8">
      <div className="page-heading !mb-0">
        <div>
          <p className="eyebrow">WEALTH · {info.subtitle.toUpperCase()}</p>
          <h1>{info.label}</h1>
          <p className="page-description">
            {categories.map((c) => c.label).join(", ")}.
          </p>
        </div>
      </div>
      {!data ? (
        <LoadState error={error} onRetry={reload} />
      ) : (
        <>
          <NetWorth holdings={data.holdings} section={section} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {info.label} total{" "}
              <strong className="text-foreground tabular-nums">
                {rupees(total)}
              </strong>{" "}
              · {visible.length} {visible.length === 1 ? "holding" : "holdings"}
            </p>
            <ArchivedToggle
              show={archived}
              onChange={setArchived}
              count={inSection.filter((h) => h.archived).length}
            />
          </div>
          {visible.length === 0 ? (
            <Card>
              <h2 className="text-xl font-semibold">
                Nothing in {info.label} yet
              </h2>
              <p className="mt-2 text-muted-foreground">
                Start with any of these — you can fill in details now or later.
              </p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link href={categoryHref(c) + "/new"} className="chip">
                      <Plus size={14} aria-hidden="true" className="mr-1" />
                      {c.singular}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            categories.map((c) => {
              const items = visible.filter((h) => h.category === c.id);
              return items.length ? (
                <CategoryGroup key={c.id} category={c} holdings={items} />
              ) : null;
            })
          )}
        </>
      )}
    </div>
  );
}

export function WealthCategory({ categoryId }: { categoryId: string }) {
  const { data, error, reload } = useWealth();
  const [archived, setArchived] = useState(false);
  const c = findCategory(categoryId)!;
  const Icon = wealthIcon(c.icon);
  const all = (data?.holdings ?? []).filter((h) => h.category === c.id);
  const visible = all.filter((h) => archived || !h.archived);
  const total = visible.reduce((s, h) => s + BigInt(h.balanceMinor), 0n);
  return (
    <div className="grid gap-6">
      <div className="page-heading !mb-0">
        <div className="flex items-start gap-4">
          <span className="category-icon">
            <Icon size={22} aria-hidden="true" />
          </span>
          <div>
            <p className="eyebrow">
              WEALTH · {findSection(c.section)!.label.toUpperCase()}
            </p>
            <h1>{c.label}</h1>
            <p className="page-description">{c.description}</p>
          </div>
        </div>
        <Button asChild>
          <Link href={categoryHref(c) + "/new"}>
            <Plus aria-hidden="true" />
            Add {c.singular.toLowerCase()}
          </Link>
        </Button>
      </div>
      {!data ? (
        <LoadState error={error} onRetry={reload} />
      ) : visible.length === 0 && !all.length ? (
        <Card>
          <h2 className="text-xl font-semibold">
            No {c.label.toLowerCase()} yet
          </h2>
          <p className="mt-2 text-muted-foreground">
            Add one with whatever you know today. Everything except the{" "}
            {c.openingLabel.toLowerCase()} can be edited later.
          </p>
          <Button asChild className="mt-5">
            <Link href={categoryHref(c) + "/new"}>
              <Plus aria-hidden="true" />
              Add {c.singular.toLowerCase()}
            </Link>
          </Button>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {c.openingLabel === "Principal" ? "Total principal" : "Total"}{" "}
              <strong className="text-foreground tabular-nums">
                {rupees(total)}
              </strong>{" "}
              · {visible.length}
            </p>
            <ArchivedToggle
              show={archived}
              onChange={setArchived}
              count={all.filter((h) => h.archived).length}
            />
          </div>
          {asCards(c) ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((h) => (
                <HoldingCard key={h.id} holding={h} />
              ))}
            </div>
          ) : (
            <ul className="holding-list">
              {visible.map((h) => (
                <HoldingRow key={h.id} holding={h} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
