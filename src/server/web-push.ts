/**
 * Web Push with WebCrypto only (works in Workers): VAPID authentication
 * (RFC 8292) and aes128gcm payload encryption (RFC 8188 / RFC 8291).
 */

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };
export type Vapid = { publicKey: string; privateKey: string; subject: string };

const encoder = new TextEncoder();

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

async function hkdf(salt: BufferSource, ikm: BufferSource, info: BufferSource, length: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** The VAPID private key (base64url "d") as a signing key; x and y come from the public key. */
async function signingKey(vapid: Vapid): Promise<CryptoKey> {
  const pub = base64UrlToBytes(vapid.publicKey);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    d: vapid.privateKey,
    x: bytesToBase64Url(pub.slice(1, 33)),
    y: bytesToBase64Url(pub.slice(33, 65)),
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function vapidHeader(endpoint: string, vapid: Vapid): Promise<string> {
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = bytesToBase64Url(
    encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: vapid.subject })),
  );
  const unsigned = `${header}.${claims}`;
  // WebCrypto ECDSA signatures are already the raw r‖s form JWS expects.
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await signingKey(vapid), encoder.encode(unsigned));
  return `vapid t=${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}, k=${vapid.publicKey}`;
}

/** Encrypt `payload` for one subscription (RFC 8291). Exported for tests. */
export async function encryptPayload(
  payload: Uint8Array<ArrayBuffer>,
  keys: { p256dh: string; auth: string },
  // Fixed values only in tests; normally fresh random ones per message.
  fixed?: { serverKeys: CryptoKeyPair; salt: Uint8Array<ArrayBuffer> },
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = base64UrlToBytes(keys.p256dh);
  const authSecret = base64UrlToBytes(keys.auth);
  const serverKeys = fixed?.serverKeys ?? ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", serverKeys.publicKey)) as ArrayBuffer);

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  // The standard field is `public`; Workers' type definitions call it `$public`.
  const ecdh = { name: "ECDH", public: uaKey } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0];
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdh, serverKeys.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(encoder.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // A single record: the payload followed by the last-record delimiter.
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(payload, new Uint8Array([2]))));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

export type PushResult = "sent" | "gone" | "failed";

/** Send one notification. "gone" means the subscription no longer exists and should be deleted. */
export async function sendPush(subscription: PushSubscriptionKeys, message: unknown, vapid: Vapid): Promise<PushResult> {
  try {
    const body = await encryptPayload(new Uint8Array(encoder.encode(JSON.stringify(message))), subscription);
    const res = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        authorization: await vapidHeader(subscription.endpoint, vapid),
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        ttl: "3600",
        urgency: "high",
      },
      body,
    });
    if (res.status === 404 || res.status === 410) return "gone";
    if (!res.ok) {
      console.error("push failed", res.status, await res.text().catch(() => ""));
      return "failed";
    }
    return "sent";
  } catch (error) {
    console.error("push failed", error);
    return "failed";
  }
}
