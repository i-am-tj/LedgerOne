import { getDatabase } from "@/lib/database";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const version = await getDatabase().appMetadata.findUnique({
      where: { key: "schema_version" },
    });
    if (version?.value !== "2") throw new Error("Schema not ready");
    return Response.json(
      { status: "ready" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
