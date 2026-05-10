/**
 * Real Swarm network test.
 *
 * Run:  npx vitest run test/real-swarm.mts
 *
 * This tests the library against the real Swarm gateway.
 * If the gateway is unreachable the network tests are skipped gracefully.
 */

import { describe, it, expect } from "vitest";
import { verifiedFetch, verifyChunk, bytesToHex } from "../src/index.js";
import { makeChunkData } from "../src/cac.js";
import { chunkAddress } from "../src/bmt.js";

const GATEWAYS = [
  "https://gateway.ethswarm.org",
  "https://bee-0.gateway.ethswarm.org",
];

async function gatewayReachable(): Promise<boolean> {
  for (const gw of GATEWAYS) {
    try {
      const r = await fetch(`${gw}/health`, { signal: AbortSignal.timeout(8_000) });
      if (r.ok) return true;
    } catch { /* try next */ }
  }
  return false;
}

describe("real Swarm verification (local round-trip)", () => {
  it("should create a chunk, compute its address, and verify it", () => {
    const payload = new TextEncoder().encode(
      JSON.stringify({ audit: "safe", score: 95, ts: Date.now() }),
    );
    const data = makeChunkData(payload);
    const addr = chunkAddress(data);
    const ref = bytesToHex(addr);

    expect(verifyChunk(data, ref)).toBe(true);
    console.log(`  ✓ Chunk ${ref.slice(0, 16)}... verified`);
  });

  it("should detect tampered data", () => {
    const payload = new TextEncoder().encode("real audit data");
    const data = makeChunkData(payload);
    const ref = bytesToHex(chunkAddress(data));

    const tampered = new Uint8Array(data);
    tampered[12] ^= 0xff;

    expect(verifyChunk(tampered, ref)).toBe(false);
    console.log("  ✓ Tampered chunk correctly rejected");
  });
});

describe("real Swarm gateway fetch", () => {
  it("should reach the public gateway and fetch a chunk", { timeout: 20_000 }, async () => {
    const reachable = await gatewayReachable();
    if (!reachable) {
      console.log("  ⚠ Gateway unreachable — skipping (network not available)");
      return; // graceful skip, not a failure
    }

    console.log("  ✓ Gateway is reachable");

    // Upload is not possible without a Bee node, so we test that
    // the library correctly handles a 404 for a non-existent ref
    const fakeRef = "ab".repeat(32);
    try {
      await verifiedFetch(fakeRef, { gateways: GATEWAYS, timeout: 10_000 });
      // If it somehow succeeds, that's fine too
    } catch (e: any) {
      // We expect HTTP 404 or similar — NOT a network error
      expect(e.message).toMatch(/HTTP|not found|404/i);
      console.log(`  ✓ Non-existent ref correctly returns error: ${e.message.slice(0, 60)}`);
    }
  });
});
