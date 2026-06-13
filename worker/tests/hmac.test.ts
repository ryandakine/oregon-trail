import { describe, it, expect } from "vitest";
import {
  signState,
  verifyState,
  deepCanonicalize,
  bufferToHex,
  hexToBuffer,
  getHmacKey,
} from "../src/hmac";
import { createInitialState, verifyIncomingState } from "../src/state";

const TEST_SECRET = "test-hmac-secret-do-not-use-in-prod";
const MIGRATION_MEMBERS: [string, string, string, string] = ["Beth", "Carl", "Dana", "Earl"];

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

// GameState v2 migration framework (docs/spec/gamestate-v2.md §5). These live
// here because they exercise the HMAC verify → migrate boundary: a state signed
// under the OLD shape must still verify, then migrate, then re-sign/re-verify
// under the new shape — the whole point of the versioned migration path.
describe("GameState v2 migration (verifyIncomingState)", () => {
  // Build a genuine pre-versioning (v1) signed state: take a fresh v2 state and
  // strip EVERY field added to the signed schema since the original game loop —
  // the exact shape migrateState must reconstruct. (challenge_id, the two Bitter
  // Path fields, recent_event_titles, landmark_rest_used were all added
  // un-versioned over time; state_version + pending_effects are the v2 adds.)
  async function makeLegacyV1Signed() {
    const { state: fresh } = await createInitialState(
      "Alice", MIGRATION_MEMBERS, "farmer", "high", TEST_SECRET,
    );
    const legacy: Record<string, unknown> = JSON.parse(JSON.stringify(fresh));
    delete legacy.state_version;
    delete (legacy.settings as Record<string, unknown>).challenge_id;
    const legacySim = legacy.simulation as Record<string, unknown>;
    delete legacySim.bitter_path_taken;
    delete legacySim.pending_event_trigger;
    delete legacySim.recent_event_titles;
    delete legacySim.landmark_rest_used;
    delete legacySim.pending_effects;
    const signature = await signState(legacy, TEST_SECRET);
    return { legacy, signature, fresh };
  }

  it("legacy v1 state verifies and migrates to v2 with all defaults injected", async () => {
    const { legacy, signature } = await makeLegacyV1Signed();
    const verified = await verifyIncomingState(
      { state: legacy as never, signature }, TEST_SECRET,
    );
    expect(verified.valid).toBe(true);
    if (!verified.valid) throw new Error("unreachable");

    expect(verified.state.state_version).toBe(2);
    expect(verified.state.simulation.pending_effects).toEqual([]);
    expect(verified.state.simulation.bitter_path_taken).toBe("none");
    // Shim: no pending_event_hash on a fresh state → trigger defaults to null.
    expect(verified.state.simulation.pending_event_trigger).toBeNull();
  });

  it("legacy state WITH a pending hash gets pending_event_trigger='event' (shim)", async () => {
    const { legacy, fresh } = await makeLegacyV1Signed();
    const legacySim = legacy.simulation as Record<string, unknown>;
    legacySim.pending_event_hash = "deadbeef";
    // Re-sign the mutated legacy shape so it verifies.
    const signature = await signState(legacy, TEST_SECRET);
    const verified = await verifyIncomingState(
      { state: legacy as never, signature }, TEST_SECRET,
    );
    expect(verified.valid).toBe(true);
    if (!verified.valid) throw new Error("unreachable");
    expect(verified.state.simulation.pending_event_trigger).toBe("event");
    // sanity: fresh state had no pending hash, so this is purely the shim path
    expect(fresh.simulation.pending_event_hash).toBeNull();
  });

  it("migrated state re-signs, re-verifies, and canonicalizes identically to a fresh v2 state", async () => {
    const { legacy, signature, fresh } = await makeLegacyV1Signed();
    const verified = await verifyIncomingState(
      { state: legacy as never, signature }, TEST_SECRET,
    );
    if (!verified.valid) throw new Error("unreachable");

    // Round-trip: the migrated shape signs and verifies cleanly.
    const reSig = await signState(verified.state, TEST_SECRET);
    expect(await verifyState(verified.state, reSig, TEST_SECRET)).toBe(true);

    // A migrated legacy state is byte-identical (post-canonicalize) to a fresh
    // createInitialState of the same content — fresh and migrated never diverge.
    expect(deepCanonicalize(verified.state)).toBe(deepCanonicalize(fresh));
  });
});
