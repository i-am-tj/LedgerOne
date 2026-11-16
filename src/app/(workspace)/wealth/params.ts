import { notFound } from "next/navigation";
import { z } from "zod";
import { findCategory, findSection } from "@/lib/wealth/catalog";

export type WealthParams = Promise<{
  section: string;
  category?: string;
  id?: string;
}>;
/** Resolves route segments to catalog entries or renders the 404 page. */
export async function resolveWealth(params: WealthParams) {
  const { section, category, id } = await params;
  const s = findSection(section);
  if (!s) notFound();
  const c = category === undefined ? undefined : findCategory(category);
  if (category !== undefined && (!c || c.section !== s.id)) notFound();
  if (id !== undefined && !z.uuid().safeParse(id).success) notFound();
  return { section: s, category: c, id };
}
