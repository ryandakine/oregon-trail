import { describe, it, expect } from "vitest";
import {
  signState,
  verifyState,
  deepCanonicalize,
  bufferToHex,
  hexToBuffer,
  getHmacKey,
} from "../src/hmac";

const TEST_SECRET = "test-hmac-secret-do-not-use-in-prod";

describe("bufferToHex / hexToBuffer round-trip", () => {
  it("converts buffer to hex and back", () => {
    const original = new Uint8Array([0, 1, 127, 128, 255]).buffer;
    const hex = bufferToHex(original);
    const recovered = hexToBuffer(hex);
    expect(new Uint8Array(recovered)).toEqual(new Uint8Array(original));
  });

  it("produces correct hex string", () => {
    const buf = new Uint8Array([0xde, 0xad, 0xbe, 0xef]).buffer;
    expect(bufferToHex(buf)).toBe("deadbeef");
  });
});

describe("deepCanonicalize", () => {
  it("produces identical output regardless of key insertion order", () => {
    const a: Record<string, unknown> = {};
    a["z"] = 1;
    a["a"] = 2;

    const b: Record<string, unknown> = {};
    b["a"] = 2;
    b["z"] = 1;

    expect(deepCanonicalize(a)).toBe(deepCanonicalize(b));
  });

  it("handles nested objects with different key orders", () => {
    const a = { outer: { z: 1, a: 2 }, first: true };
    const b = { first: true, outer: { a: 2, z: 1 } };
    expect(deepCanonicalize(a)).toBe(deepCanonicalize(b));
  });

  it("handles arrays (preserves order)", () => {
    const a = { items: [3, 1, 2] };
    const b = { items: [3, 1, 2] };
    expect(deepCanonicalize(a)).toBe(deepCanonicalize(b));

    const c = { items: [1, 2, 3] };
    expect(deepCanonicalize(a)).not.toBe(deepCanonicalize(c));
  });

  it("handles null values", () => {
    const obj = { a: null, b: 1 };
    expect(deepCanonicalize(obj)).toBe('{"a":null,"b":1}');
  });
});

describe("signState + verifyState", () => {
  it("round-trip: sign then verify succeeds", async () => {
    const state = { party: { leader: "Alice" }, supplies: { food: 100 } };
    const sig = await signState(state, TEST_SECRET);
    const valid = await verifyState(state, sig, TEST_SECRET);
    expect(valid).toBe(true);
  });

  it("mutate one field -> verify fails", async () => {
    const state = { party: { leader: "Alice" }, supplies: { food: 100 } };
    const sig = await signState(state, TEST_SECRET);

    const tampered = { party: { leader: "Alice" }, supplies: { food: 99 } };
    const valid = await verifyState(tampered, sig, TEST_SECRET);
    expect(valid).toBe(false);
  });

  it("same state + secret -> deterministic signature", async () => {
    const state = { x: 1, y: [2, 3], z: { a: "b" } };
    const sig1 = await signState(state, TEST_SECRET);
    const sig2 = await signState(state, TEST_SECRET);
    expect(sig1).toBe(sig2);
  });

  it("different secrets -> different signatures", async () => {
    const state = { data: "hello" };
    const sig1 = await signState(state, "secret-one");
    const sig2 = await signState(state, "secret-two");
    expect(sig1).not.toBe(sig2);
  });

  it("signature is 64-char lowercase hex", async () => {
    const state = { anything: true };
    const sig = await signState(state, TEST_SECRET);
    expect(sig).toHaveLength(64);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("empty object signing works", async () => {
    const sig = await signState({}, TEST_SECRET);
    expect(sig).toHaveLength(64);
    const valid = await verifyState({}, sig, TEST_SECRET);
    expect(valid).toBe(true);
  });

  it("nested object key ordering doesn't affect signature", async () => {
    const a: Record<string, unknown> = { b: { d: 1, c: 2 }, a: 3 };
    const b: Record<string, unknown> = { a: 3, b: { c: 2, d: 1 } };
    const sigA = await signState(a, TEST_SECRET);
    const sigB = await signState(b, TEST_SECRET);
    expect(sigA).toBe(sigB);
  });
});

describe("getHmacKey", () => {
  it("returns a CryptoKey", async () => {
    const key = await getHmacKey(TEST_SECRET);
    expect(key).toBeDefined();
    expect(key.type).toBe("secret");
    expect(key.algorithm).toMatchObject({ name: "HMAC" });
  });
});
