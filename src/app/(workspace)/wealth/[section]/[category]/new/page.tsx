import { HoldingForm } from "@/components/wealth/holding-form";
import { resolveWealth, type WealthParams } from "../../../params";
export default async function NewHoldingPage({
  params,
}: {
  params: WealthParams;
}) {
  const { category } = await resolveWealth(params);
  return <HoldingForm categoryId={category!.id} />;
}
