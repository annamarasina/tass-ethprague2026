import { describe, it, expect } from "vitest";
import { bmtRootHash, chunkAddress, SPAN_SIZE, MAX_CHUNK_PAYLOAD_SIZE } from "../src/bmt.js";
import { keccak256, concatBytes, writeUint64LE, hexToBytes, bytesToHex } from "../src/utils.js";

describe("BMT", () => {
  it("should compute root hash for a single zero-filled chunk", () => {
    const payload = new Uint8Array(MAX_CHUNK_PAYLOAD_SIZE); // all zeros
    const root = bmtRootHash(payload);
    expect(root).toBeInstanceOf(Uint8Array);
    expect(root.length).toBe(32);
  });

  it("should pad payload shorter than 4096 with zeros", () => {
    const short = new Uint8Array([1, 2, 3]);
    const root1 = bmtRootHash(short);

    // Manually pad and hash — should match
    const padded = new Uint8Array(MAX_CHUNK_PAYLOAD_SIZE);
    padded.set(short);
    const root2 = bmtRootHash(padded);

    expect(bytesToHex(root1)).toBe(bytesToHex(root2));
  });

  it("should reject payload larger than 4096", () => {
    const tooBig = new Uint8Array(MAX_CHUNK_PAYLOAD_SIZE + 1);
    expect(() => bmtRootHash(tooBig)).toThrow(/exceeds max/i);
  });

  it("should produce different hashes for different payloads", () => {
    const a = new Uint8Array([1, 0, 0]);
    const b = new Uint8Array([0, 1, 0]);
    const rootA = bmtRootHash(a);
    const rootB = bmtRootHash(b);
    expect(bytesToHex(rootA)).not.toBe(bytesToHex(rootB));
  });

  it("should compute chunk address = keccak256(span || rootHash)", () => {
    const payload = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const span = writeUint64LE(BigInt(payload.length));
    const data = concatBytes(span, payload);

    const addr = chunkAddress(data);
    expect(addr.length).toBe(32);

    // Manual check: address should equal keccak256(span || bmtRoot(payload))
    const root = bmtRootHash(payload);
    const expected = keccak256(concatBytes(span, root));
    expect(bytesToHex(addr)).toBe(bytesToHex(expected));
  });
});
