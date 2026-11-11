import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDatabase } from "../database";
import { createAuth } from "./create-auth";
import { readAuthConfig } from "./policy";
import { getOwnerSession } from "./requests";

export function getAuthRuntime() {
  const config = readAuthConfig(process.env);
  if (!config) return null;
  return { auth: createAuth(config, getDatabase()), config };
}
export async function requirePageSession() {
  const session = await optionalPageSession();
  if (!session) redirect("/login");
  return session;
}
export async function optionalPageSession() {
  try {
    const runtime = getAuthRuntime();
    if (!runtime) return null;
    return await getOwnerSession(runtime.auth, runtime.config, await headers());
  } catch {
    return null;
  }
}
