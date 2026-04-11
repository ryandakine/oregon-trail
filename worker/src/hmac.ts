import type { GameState } from "./types";

export function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

export async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function deepCanonicalize(obj: unknown): string {
  return JSON.stringify(sortKeys(obj));
}

function sortKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export async function signState(
  state: object,
  secret: string,
): Promise<string> {
  const key = await getHmacKey(secret);
  const enc = new TextEncoder();
  const data = enc.encode(deepCanonicalize(state));
  const sig = await crypto.subtle.sign("HMAC", key, data);
  return bufferToHex(sig);
}

export async function verifyState(
  state: object,
  signature: string,
  secret: string,
): Promise<boolean> {
  const key = await getHmacKey(secret);
  const enc = new TextEncoder();
  const data = enc.encode(deepCanonicalize(state));
  const sigBuffer = hexToBuffer(signature);
  return crypto.subtle.verify("HMAC", key, sigBuffer, data);
}
