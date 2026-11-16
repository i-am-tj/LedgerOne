import { HoldingDetail } from "@/components/wealth/holding-detail";
import { resolveWealth, type WealthParams } from "../../../params";
export default async function HoldingPage({
  params,
}: {
  params: WealthParams;
}) {
  const { id } = await resolveWealth(params);
  return <HoldingDetail holdingId={id!} />;
}
