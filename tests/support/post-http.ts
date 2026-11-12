// Test-only HTTP adapter for the same handler used by the App Router. It is
// never mounted by the application and exposes no fault-control route/header.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { postRequest } from "../../src/lib/ledger/commands/http";
import type { postHarness } from "./post-harness";
export async function postHTTP(h: Awaited<ReturnType<typeof postHarness>>) {
  const signals: AbortSignal[] = [];
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url!, h.runtime.config.baseURL);
      const id =
        /^\/api\/workspaces\/([^/]+)\/ledger\/commands$/.exec(
          url.pathname,
        )?.[1] ?? "invalid";
      const headers = new Headers();
      for (const [name, value] of Object.entries(req.headers))
        if (value !== undefined)
          headers.set(name, Array.isArray(value) ? value.join(", ") : value);
      const controller = new AbortController();
      signals.push(controller.signal);
      req.on("aborted", () => controller.abort());
      res.on("close", () => {
        if (!res.writableEnded) controller.abort();
      });
      let cancelled = false;
      const iterator = req[Symbol.asyncIterator]();
      const body = new ReadableStream<Uint8Array>({
        async pull(stream) {
          try {
            const next = await iterator.next();
            if (cancelled) return;
            if (next.done) stream.close();
            else stream.enqueue(Buffer.from(next.value));
          } catch (error) {
            if (!cancelled) stream.error(error);
          }
        },
        cancel() {
          cancelled = true;
          req.pause();
        },
      });
      const init = {
        method: req.method,
        headers,
        signal: controller.signal,
        ...(!["GET", "HEAD"].includes(req.method ?? "")
          ? { body, duplex: "half" as const }
          : {}),
      };
      const response = await postRequest(
        new Request(url, init),
        id,
        h.runtime,
        h.executor,
        h.recordTrace,
      );
      if (res.destroyed) return;
      if (!req.complete) {
        res.shouldKeepAlive = false;
        res.setHeader("connection", "close");
      }
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
    signals,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
