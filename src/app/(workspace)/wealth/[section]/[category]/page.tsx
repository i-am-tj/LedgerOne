import { WealthCategory } from "@/components/wealth/wealth-views";
import { resolveWealth, type WealthParams } from "../../params";
export default async function CategoryPage({
  params,
}: {
  params: WealthParams;
}) {
  const { category } = await resolveWealth(params);
  return <WealthCategory categoryId={category!.id} />;
}
