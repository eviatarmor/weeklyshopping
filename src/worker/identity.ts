import { z } from "zod";
import household from "../../config/household.json";
import { verifyAccessJwt } from "./access";

export type Member = { email: string; name: string };
export type Identity = { user: Member; household: { id: string; name: string; members: Member[] } };

export const DEV_USER_COOKIE = "dev_user";
/** Set by the Worker on requests it forwards to the household Durable Object. */
export const IDENTITY_HEADER = "x-weeklyshopping-identity";

const membersSchema = z.array(z.object({ email: z.email(), name: z.string().min(1) }));

function isLocalhost(request: Request) {
  const { hostname } = new URL(request.url);
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * Real member emails live in the HOUSEHOLD_MEMBERS secret, never in the repo.
 * Missing or malformed means nobody gets in.
 */
function members(env: Env): Member[] {
  if (!env.HOUSEHOLD_MEMBERS) return [];
  try {
    return membersSchema.parse(JSON.parse(env.HOUSEHOLD_MEMBERS)).map((m) => ({ ...m, email: m.email.toLowerCase() }));
  } catch {
    console.error("HOUSEHOLD_MEMBERS secret is not valid JSON [{ email, name }]");
    return [];
  }
}

/** Dev auth only applies on localhost, and never once Access is configured. */
export function devAuthEnabled(env: Env, request: Request) {
  return env.DEV_AUTH === "true" && !env.ACCESS_AUD && isLocalhost(request);
}

export async function resolveIdentity(request: Request, env: Env): Promise<Identity | null> {
  if (devAuthEnabled(env, request)) {
    const devMembers = household.devMembers;
    const wanted = readCookie(request, DEV_USER_COOKIE);
    const user = devMembers.find((m) => m.email === wanted) ?? devMembers[0];
    if (!user) return null;
    return { user, household: { id: `${household.id}-dev`, name: `${household.name} (dev)`, members: devMembers } };
  }

  const teamDomain = String(env.ACCESS_TEAM_DOMAIN);
  const aud = String(env.ACCESS_AUD);
  if (!teamDomain || !aud) return null;
  const email = await verifyAccessJwt(request, teamDomain, aud);
  if (!email) return null;
  const all = members(env);
  const user = all.find((m) => m.email === email);
  if (!user) return null;
  return { user, household: { id: household.id, name: household.name, members: all } };
}
