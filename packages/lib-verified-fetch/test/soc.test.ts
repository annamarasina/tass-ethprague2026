import { describe, it, expect } from "vitest";
import { keygen, signAsync, getPublicKey } from "@noble/secp256k1";
import {
  verifySingleOwnerChunk,
  socAddress,
  feedIdentifier,
} from "../src/soc.js";
import { chunkAddress } from "../src/bmt.js";
import { makeChunkData } from "../src/cac.js";
import {
  keccak256,
  concatBytes,
  bytesToHex,
  hexToBytes,
  bytesEqual,
} from "../src/utils.js";

// ─── Helper: sign an SOC like a Bee node would ────────────

/**
 * Build a complete SOC binary blob:
 *   identifier (32) || signature (65) || span (8) || payload (…)
 */
async function buildSOC(
  privateKey: Uint8Array,
  identifier: Uint8Array,
  payload: Uint8Array,
): Promise<{ data: Uint8Array; address: Uint8Array; owner: Uint8Array }> {
  // 1. Build inner CAC data (span + payload)
  const cacData = makeChunkData(payload);
  const cacAddr = chunkAddress(cacData);

  // 2. Digest = keccak256(identifier || cacAddress)
  const digest = keccak256(concatBytes(identifier, cacAddr));

  // 3. Sign with secp256k1 (recoverable) — v3 API: format: 'recovered'
  const sig65 = await signAsync(digest, privateKey, { format: "recovered" as never });
  // sig65 is 65 bytes: r(32) || s(32) || recovery(1), recovery = 0 or 1
  // Convert to Ethereum format: v = recovery + 27
  const ethSig = new Uint8Array(65);
  ethSig.set(sig65.slice(0, 64));
  ethSig[64] = sig65[64] + 27;

  // 4. Derive owner address
  const pubKey = getPublicKey(privateKey, false); // uncompressed 65 bytes
  const owner = keccak256(pubKey.slice(1)).slice(12);  // last 20 bytes

  // 5. Compute expected SOC address
  const addr = socAddress(identifier, owner);

  // 6. Assemble binary: identifier || signature || cacData
  const socData = concatBytes(identifier, ethSig, cacData);

  return { data: socData, address: addr, owner };
}

// ─── Tests ─────────────────────────────────────────────────

describe("SOC verification", () => {
  it("should verify a valid single owner chunk", async () => {
    const privKey = keygen().secretKey;
    const identifier = keccak256(new TextEncoder().encode("test-id"));
    const payload = new TextEncoder().encode("Hello, SOC!");

    const { data, address, owner } = await buildSOC(privKey, identifier, payload);

    const result = await verifySingleOwnerChunk(data, address);
    expect(bytesToHex(result.address)).toBe(bytesToHex(address));
    expect(bytesToHex(result.owner)).toBe(bytesToHex(owner));
    expect(bytesToHex(result.identifier)).toBe(bytesToHex(identifier));
  });

  it("should reject SOC with wrong address", async () => {
    const privKey = keygen().secretKey;
    const identifier = keccak256(new TextEncoder().encode("wrong-addr"));
    const payload = new TextEncoder().encode("data");

    const { data } = await buildSOC(privKey, identifier, payload);
    const fakeAddr = new Uint8Array(32); // all zeros

    await expect(verifySingleOwnerChunk(data, fakeAddr)).rejects.toThrow(
      /verification failed/i,
    );
  });

  it("should reject SOC with tampered payload", async () => {
    const privKey = keygen().secretKey;
    const identifier = keccak256(new TextEncoder().encode("tampered"));
    const payload = new TextEncoder().encode("original data");

    const { data, address } = await buildSOC(privKey, identifier, payload);

    // Tamper a byte in the payload region (after identifier + sig + span)
    const tampered = new Uint8Array(data);
    tampered[32 + 65 + 8 + 2] ^= 0xff;

    await expect(verifySingleOwnerChunk(tampered, address)).rejects.toThrow();
  });

  it("should reject SOC with tampered signature", async () => {
    const privKey = keygen().secretKey;
    const identifier = keccak256(new TextEncoder().encode("badsig"));
    const payload = new TextEncoder().encode("data");

    const { data, address } = await buildSOC(privKey, identifier, payload);

    // Tamper a byte in the signature region
    const tampered = new Uint8Array(data);
    tampered[40] ^= 0xff; // inside signature

    await expect(verifySingleOwnerChunk(tampered, address)).rejects.toThrow();
  });

  it("should reject SOC data that is too small", async () => {
    const tinyData = new Uint8Array(32 + 65 + 7); // less than identifier + sig + span
    const addr = new Uint8Array(32);

    await expect(verifySingleOwnerChunk(tinyData, addr)).rejects.toThrow(
      /too small/i,
    );
  });

  it("should sign with one key and fail verification with different address", async () => {
    const privKey1 = keygen().secretKey;
    const privKey2 = keygen().secretKey;
    const identifier = keccak256(new TextEncoder().encode("key-mismatch"));
    const payload = new TextEncoder().encode("data");

    const soc1 = await buildSOC(privKey1, identifier, payload);
    // Compute address for key2 — it should not match
    const pubKey2 = getPublicKey(privKey2, false);
    const owner2 = keccak256(pubKey2.slice(1)).slice(12);
    const wrongAddr = socAddress(identifier, owner2);

    await expect(verifySingleOwnerChunk(soc1.data, wrongAddr)).rejects.toThrow(
      /verification failed/i,
    );
  });
});

describe("socAddress", () => {
  it("should compute keccak256(identifier || owner)", () => {
    const id = new Uint8Array(32).fill(0xaa);
    const owner = new Uint8Array(20).fill(0xbb);
    const addr = socAddress(id, owner);

    const expected = keccak256(concatBytes(id, owner));
    expect(bytesToHex(addr)).toBe(bytesToHex(expected));
  });
});

describe("feedIdentifier", () => {
  it("should be deterministic for same topic and index", () => {
    const topic = keccak256(new TextEncoder().encode("my-feed"));
    const id1 = feedIdentifier(topic, 0n);
    const id2 = feedIdentifier(topic, 0n);
    expect(bytesToHex(id1)).toBe(bytesToHex(id2));
  });

  it("should produce different identifiers for different indices", () => {
    const topic = keccak256(new TextEncoder().encode("my-feed"));
    const id0 = feedIdentifier(topic, 0n);
    const id1 = feedIdentifier(topic, 1n);
    expect(bytesToHex(id0)).not.toBe(bytesToHex(id1));
  });

  it("should produce different identifiers for different topics", () => {
    const topicA = keccak256(new TextEncoder().encode("feed-a"));
    const topicB = keccak256(new TextEncoder().encode("feed-b"));
    const idA = feedIdentifier(topicA, 0n);
    const idB = feedIdentifier(topicB, 0n);
    expect(bytesToHex(idA)).not.toBe(bytesToHex(idB));
  });
});
