import { Accounts } from "@/components/accounts/accounts";
export default async function AccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Accounts accountId={id} />;
}
