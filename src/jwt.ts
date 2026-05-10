import type { JwtPayload } from "./types";

const encoder = new TextEncoder();

function base64UrlEncode(input: string | ArrayBuffer): string {
  const bytes = typeof input === "string" ? encoder.encode(input) : new Uint8Array(input);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlDecode(input: string): ArrayBuffer {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes.buffer.slice(0);
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const body = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign("HMAC", await importKey(secret), encoder.encode(body));

  return `${body}.${base64UrlEncode(signature)}`;
}

export async function verifyJwt(token: string, secret: string, now = Math.floor(Date.now() / 1000)): Promise<JwtPayload> {
  const parts = token.split(".");

  if (parts.length !== 3) {
    throw new Error("Malformed token");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signedData = `${encodedHeader}.${encodedPayload}`;
  const ok = await crypto.subtle.verify(
    "HMAC",
    await importKey(secret),
    base64UrlDecode(encodedSignature),
    encoder.encode(signedData),
  );

  if (!ok) {
    throw new Error("Invalid signature");
  }

  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader))) as { alg?: string };
  if (header.alg !== "HS256") {
    throw new Error("Unsupported algorithm");
  }

  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as JwtPayload;
  if (!payload.sid || !payload.sub || !payload.exp || payload.exp <= now) {
    throw new Error("Expired token");
  }

  return payload;
}
