import { spawnSync } from "node:child_process";
import { loadProfile } from "./load-env";
import { databaseSettings } from "../src/lib/profile";

const profile = process.argv[2];
if (profile !== "development" && profile !== "production")
  throw new Error("Choose development or production explicitly.");
loadProfile(profile);
databaseSettings(process.env, true);
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  {
    stdio: "inherit",
    env: process.env,
  },
);
process.exitCode = result.status ?? 1;
