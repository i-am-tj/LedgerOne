// Test-only HTTP adapter for the same handler used by the App Router. It is
// never mounted by the application and exposes no fault-control route/header.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { postRequest } from "../../src/lib/ledger/commands/http";
import type { postHarness } from "./post-harness";
export async function postHTTP(h: Awaited<ReturnType<typeof postHarness>>) {
  const server = createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks);
      const url = new URL(req.url!, h.runtime.config.baseURL);
      const id =
        /^\/api\/workspaces\/([^/]+)\/ledger\/commands$/.exec(
          url.pathname,
        )?.[1] ?? "invalid";
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers))
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      const response = await postRequest(
        new Request(url, {
          method: req.method,
          headers,
          ...(body.length ? { body } : {}),
        }),
        id,
        h.runtime,
        h.executor,
      );
      if (res.destroyed) return;
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } catch {
      res.writeHead(503);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  h.runtime.config.baseURL = origin;
  return {
    origin,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
