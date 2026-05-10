import { describe, it, expect } from "vitest";
import {
  keccak256,
  concatBytes,
  bytesEqual,
  hexToBytes,
  bytesToHex,
  writeUint64LE,
  readUint64LE,
} from "../src/utils.js";

describe("keccak256", () => {
  it("should hash empty input to the known keccak256 of empty bytes", () => {
    const hash = keccak256(new Uint8Array(0));
    expect(hash.length).toBe(32);
    // keccak256("") = c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470
    expect(bytesToHex(hash)).toBe(
      "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
    );
  });

  it("should be deterministic", () => {
    const data = new Uint8Array([1, 2, 3]);
    expect(bytesToHex(keccak256(data))).toBe(bytesToHex(keccak256(data)));
  });
});

describe("concatBytes", () => {
  it("should concatenate arrays", () => {
    const result = concatBytes(
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
      new Uint8Array([5]),
    );
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5]);
  });

  it("should handle empty arrays", () => {
    const result = concatBytes(new Uint8Array(0), new Uint8Array([1]));
    expect(Array.from(result)).toEqual([1]);
  });
});

describe("bytesEqual", () => {
  it("should return true for equal arrays", () => {
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
  });

  it("should return false for different arrays", () => {
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
  });

  it("should return false for different lengths", () => {
    expect(bytesEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("hex conversion", () => {
  it("should round-trip hex ↔ bytes", () => {
    const original = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(bytesToHex(original)).toBe("deadbeef");
    expect(Array.from(hexToBytes("deadbeef"))).toEqual(Array.from(original));
  });

  it("should handle 0x prefix", () => {
    expect(Array.from(hexToBytes("0xab"))).toEqual([0xab]);
  });

  it("should reject odd-length hex", () => {
    expect(() => hexToBytes("abc")).toThrow(/even length/i);
  });
});

describe("uint64 LE", () => {
  it("should round-trip small values", () => {
    const buf = writeUint64LE(42n);
    expect(buf.length).toBe(8);
    expect(readUint64LE(buf)).toBe(42n);
  });

  it("should round-trip zero", () => {
    expect(readUint64LE(writeUint64LE(0n))).toBe(0n);
  });

  it("should round-trip large values", () => {
    const big = 2n ** 48n + 123n;
    expect(readUint64LE(writeUint64LE(big))).toBe(big);
  });
});
