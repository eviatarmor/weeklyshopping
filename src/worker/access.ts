import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const jwksByTeam = new Map<string, JWTVerifyGetKey>();

/**
 * Verify the JWT Cloudflare Access attaches to every request it lets through.
 * Returns the authenticated email, or null when the token is missing/invalid.
 */
export async function verifyAccessJwt(request: Request, teamDomain: string, audience: string): Promise<string | null> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;
  const issuer = `https://${teamDomain}`;
  let jwks = jwksByTeam.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    jwksByTeam.set(teamDomain, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience });
    return typeof payload.email === "string" ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}
