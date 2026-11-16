import { HoldingForm } from "@/components/wealth/holding-form";
import { resolveWealth, type WealthParams } from "../../../../params";
export default async function EditHoldingPage({
  params,
}: {
  params: WealthParams;
}) {
  const { category, id } = await resolveWealth(params);
  return <HoldingForm categoryId={category!.id} holdingId={id} />;
}
