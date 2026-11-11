import { config } from "dotenv";
import type { Profile } from "../src/lib/profile";
import { join } from "node:path";

// Unlike dotenv/config, development tooling never falls through to production .env.
export function loadProfile(profile: Profile, directory = process.cwd()) {
  config({
    path: join(
      directory,
      profile === "production" ? ".env" : ".env.development.local",
    ),
    quiet: true,
  });
  process.env.LEDGERONE_ENV = profile;
}
