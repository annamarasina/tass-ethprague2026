import { describe, it, expect } from "vitest";
import { verifyContentAddressedChunk, makeChunkData } from "../src/cac.js";
import { chunkAddress } from "../src/bmt.js";
import { bytesToHex, writeUint64LE, concatBytes } from "../src/utils.js";

describe("CAC verification", () => {
  it("should verify a valid content-addressed chunk", () => {
    const payload = new TextEncoder().encode("Hello, Swarm!");
    const data = makeChunkData(payload);
    const address = chunkAddress(data);

    const result = verifyContentAddressedChunk(data, address);
    expect(result.verified !== undefined || result.address).toBeTruthy();
    expect(bytesToHex(result.address)).toBe(bytesToHex(address));
    expect(result.payload.length).toBe(payload.length);
  });

  it("should reject a chunk with wrong address", () => {
    const payload = new TextEncoder().encode("Good data");
    const data = makeChunkData(payload);
    const fakeAddr = new Uint8Array(32); // all zeros — wrong

    expect(() => verifyContentAddressedChunk(data, fakeAddr)).toThrow(
      /verification failed/i,
    );
  });

  it("should reject tampered data", () => {
    const payload = new TextEncoder().encode("Original");
    const data = makeChunkData(payload);
    const address = chunkAddress(data);

    // Tamper with a byte in the payload
    const tampered = new Uint8Array(data);
    tampered[10] ^= 0xff;

    expect(() => verifyContentAddressedChunk(tampered, address)).toThrow(
      /verification failed/i,
    );
  });

  it("should reject data that is too small", () => {
    const tooSmall = new Uint8Array(8); // only span, no payload
    const addr = new Uint8Array(32);
    expect(() => verifyContentAddressedChunk(tooSmall, addr)).toThrow(/too small/i);
  });

  it("should reject payload exceeding max size", () => {
    expect(() => makeChunkData(new Uint8Array(4097))).toThrow(/out of range/i);
  });

  it("should use custom span when provided", () => {
    const payload = new TextEncoder().encode("test");
    const data1 = makeChunkData(payload);
    const data2 = makeChunkData(payload, 999n);

    // Different span → different address
    const addr1 = chunkAddress(data1);
    const addr2 = chunkAddress(data2);
    expect(bytesToHex(addr1)).not.toBe(bytesToHex(addr2));
  });
});
