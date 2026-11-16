import { WealthSection } from "@/components/wealth/wealth-views";
import { resolveWealth, type WealthParams } from "../params";
export default async function SectionPage({
  params,
}: {
  params: WealthParams;
}) {
  const { section } = await resolveWealth(params);
  return <WealthSection section={section.id} />;
}
