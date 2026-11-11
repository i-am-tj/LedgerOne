import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
const resolve = {
  alias: {
    "server-only": fileURLToPath(
      new URL("./tests/support/server-only.ts", import.meta.url),
    ),
  },
};
export default defineConfig({
  test: {
    projects: [
      { resolve, test: { name: "unit", include: ["src/**/*.test.ts"] } },
      {
        resolve,
        test: {
          name: "integration",
          setupFiles: ["tests/integration/setup-env.ts"],
          include: ["tests/integration/**/*.test.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
