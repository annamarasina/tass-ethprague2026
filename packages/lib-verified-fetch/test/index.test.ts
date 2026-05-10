import { describe, it, expect } from "vitest";
import {
  verifiedFetch,
  verifyChunk,
  VerifiedResponse,
  hexToBytes,
  bytesToHex,
} from "../src/index.js";
import { chunkAddress } from "../src/bmt.js";
import { makeChunkData } from "../src/cac.js";
import { writeUint64LE, concatBytes } from "../src/utils.js";

// ─── Mock fetch for testing ────────────────────────────────

function mockGatewayFetch(chunks: Map<string, Uint8Array>) {
  return async (url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    // Extract reference from /chunks/<hex> or /bzz/<hex>
    const match = urlStr.match(/\/(chunks|bzz)\/([0-9a-fA-F]{64})/);
    if (!match) {
      return new Response("Not found", { status: 404 });
    }

    const ref = match[2].toLowerCase();
    const data = chunks.get(ref);
    if (!data) {
      return new Response("Chunk not found", { status: 404 });
    }

    return new Response(data.buffer, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    });
  };
}

/** Create a single-chunk file and register it in the mock gateway. */
function createMockChunk(content: string): { ref: string; chunks: Map<string, Uint8Array> } {
  const payload = new TextEncoder().encode(content);
  const data = makeChunkData(payload);
  const addr = chunkAddress(data);
  const ref = bytesToHex(addr);
  const chunks = new Map<string, Uint8Array>();
  chunks.set(ref, data);
  return { ref, chunks };
}

/** Create a multi-chunk file (2 leaf chunks + 1 intermediate root). */
function createMultiChunkFile(content: string): { ref: string; chunks: Map<string, Uint8Array> } {
  const fullPayload = new TextEncoder().encode(content);
  const mid = Math.ceil(fullPayload.length / 2);
  const part1 = fullPayload.slice(0, mid);
  const part2 = fullPayload.slice(mid);

  const chunks = new Map<string, Uint8Array>();

  // Leaf 1
  const leaf1Data = makeChunkData(part1);
  const leaf1Addr = chunkAddress(leaf1Data);
  chunks.set(bytesToHex(leaf1Addr), leaf1Data);

  // Leaf 2
  const leaf2Data = makeChunkData(part2);
  const leaf2Addr = chunkAddress(leaf2Data);
  chunks.set(bytesToHex(leaf2Addr), leaf2Data);

  // Root intermediate chunk: span = total length, payload = leaf1Addr || leaf2Addr
  const totalSpan = writeUint64LE(BigInt(fullPayload.length));
  const rootPayload = concatBytes(leaf1Addr, leaf2Addr);
  const rootData = concatBytes(totalSpan, rootPayload);
  const rootAddr = chunkAddress(rootData);
  chunks.set(bytesToHex(rootAddr), rootData);

  return { ref: bytesToHex(rootAddr), chunks };
}

// ─── Tests ─────────────────────────────────────────────────

describe("verifiedFetch", () => {
  it("should fetch and verify a single-chunk file", async () => {
    const { ref, chunks } = createMockChunk("Hello, Swarm!");
    const fetchFn = mockGatewayFetch(chunks);

    const res = await verifiedFetch(ref, {
      gateway: "https://mock.gateway",
      fetch: fetchFn as typeof globalThis.fetch,
    });

    expect(res).toBeInstanceOf(VerifiedResponse);
    expect(res.verified).toBe(true);
    expect(res.text()).toBe("Hello, Swarm!");
    expect(res.reference).toBe(ref);
  });

  it("should fetch and verify a multi-chunk file", async () => {
    const content = "A".repeat(100); // small but split into 2 chunks
    const { ref, chunks } = createMultiChunkFile(content);
    const fetchFn = mockGatewayFetch(chunks);

    const res = await verifiedFetch(ref, {
      gateway: "https://mock.gateway",
      fetch: fetchFn as typeof globalThis.fetch,
    });

    expect(res.verified).toBe(true);
    expect(res.text()).toBe(content);
  });

  it("should detect tampered single-chunk data", async () => {
    const { ref, chunks } = createMockChunk("Legitimate data");
    // Tamper with the stored chunk
    const stored = chunks.get(ref)!;
    const tampered = new Uint8Array(stored);
    tampered[12] ^= 0xff;
    chunks.set(ref, tampered);

    const fetchFn = mockGatewayFetch(chunks);

    await expect(
      verifiedFetch(ref, {
        gateway: "https://mock.gateway",
        fetch: fetchFn as typeof globalThis.fetch,
      }),
    ).rejects.toThrow(/verification FAILED/i);
  });

  it("should skip verification in 'none' mode", async () => {
    const content = "Unverified content";
    const payload = new TextEncoder().encode(content);
    const chunks = new Map<string, Uint8Array>();
    // Use a fake ref that wouldn't match — but verification is off
    const fakeRef = "a".repeat(64);
    chunks.set(fakeRef, payload);

    const fetchFn = mockGatewayFetch(chunks);

    const res = await verifiedFetch(fakeRef, {
      gateway: "https://mock.gateway",
      fetch: fetchFn as typeof globalThis.fetch,
      verify: "none",
    });

    expect(res.verified).toBe(false);
    expect(res.text()).toBe(content);
  });

  it("should reject invalid reference format", async () => {
    await expect(verifiedFetch("not-a-valid-hash")).rejects.toThrow(
      /Invalid Swarm reference/i,
    );
  });

  it("should handle gateway errors gracefully", async () => {
    const fetchFn = async () => new Response("Internal Server Error", { status: 500 });

    await expect(
      verifiedFetch("a".repeat(64), {
        gateway: "https://mock.gateway",
        fetch: fetchFn as typeof globalThis.fetch,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });
});

describe("verifyChunk", () => {
  it("should return true for a valid chunk", () => {
    const payload = new TextEncoder().encode("Test");
    const data = makeChunkData(payload);
    const addr = chunkAddress(data);
    const ref = bytesToHex(addr);

    expect(verifyChunk(data, ref)).toBe(true);
  });

  it("should return false for a tampered chunk", () => {
    const payload = new TextEncoder().encode("Test");
    const data = makeChunkData(payload);
    const addr = chunkAddress(data);
    const ref = bytesToHex(addr);

    const tampered = new Uint8Array(data);
    tampered[9] ^= 0xff;

    expect(verifyChunk(tampered, ref)).toBe(false);
  });
});

describe("VerifiedResponse", () => {
  it("should parse JSON", () => {
    const obj = { key: "value", n: 42 };
    const data = new TextEncoder().encode(JSON.stringify(obj));
    const res = new VerifiedResponse(data, "a".repeat(64), true);
    expect(res.json()).toEqual(obj);
  });

  it("should return raw bytes", () => {
    const data = new Uint8Array([1, 2, 3]);
    const res = new VerifiedResponse(data, "a".repeat(64), true);
    expect(res.bytes()).toEqual(data);
  });
});

describe("gateway fallback", () => {
  it("should fall back to the second gateway when the first fails", async () => {
    const { ref, chunks } = createMockChunk("Fallback test");
    let callCount = 0;

    const fetchFn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      callCount++;

      // First gateway always fails
      if (urlStr.startsWith("https://broken.gateway")) {
        return new Response("Service Unavailable", { status: 503 });
      }

      // Second gateway works
      const match = urlStr.match(/\/(chunks|bzz)\/([0-9a-fA-F]{64})/);
      if (!match) return new Response("Not found", { status: 404 });
      const data = chunks.get(match[2].toLowerCase());
      if (!data) return new Response("Not found", { status: 404 });
      return new Response(data.buffer, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    };

    const res = await verifiedFetch(ref, {
      gateways: ["https://broken.gateway", "https://working.gateway"],
      fetch: fetchFn as typeof globalThis.fetch,
    });

    expect(res.verified).toBe(true);
    expect(res.text()).toBe("Fallback test");
    expect(callCount).toBe(2); // tried broken, then working
  });

  it("should throw if all gateways fail", async () => {
    const fetchFn = async () => new Response("Error", { status: 500 });

    await expect(
      verifiedFetch("a".repeat(64), {
        gateways: ["https://gw1.fail", "https://gw2.fail"],
        fetch: fetchFn as typeof globalThis.fetch,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("should not retry on verification failure", async () => {
    const { ref, chunks } = createMockChunk("Tampered");
    // Tamper the chunk
    const stored = chunks.get(ref)!;
    const tampered = new Uint8Array(stored);
    tampered[12] ^= 0xff;
    chunks.set(ref, tampered);

    let callCount = 0;
    const fetchFn = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
      callCount++;
      const match = urlStr.match(/\/(chunks|bzz)\/([0-9a-fA-F]{64})/);
      if (!match) return new Response("Not found", { status: 404 });
      const data = chunks.get(match[2].toLowerCase());
      if (!data) return new Response("Not found", { status: 404 });
      return new Response(data.buffer, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    };

    await expect(
      verifiedFetch(ref, {
        gateways: ["https://gw1.test", "https://gw2.test"],
        fetch: fetchFn as typeof globalThis.fetch,
      }),
    ).rejects.toThrow(/verification FAILED/i);

    expect(callCount).toBe(1); // should not retry on verification failure
  });
});
