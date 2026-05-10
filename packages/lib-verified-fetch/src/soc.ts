/**
 * Single Owner Chunk (SOC) / Feed verification.
 *
 * A SOC's address is determined by:
 *   socAddress = keccak256(identifier || ownerAddress)
 *
 * Its integrity is verified by recovering the signer from the
 * Ethereum signature over: keccak256(identifier || cacAddress).
 *
 * SOC binary layout (before the actual data):
 *   [identifier: 32 bytes][signature: 65 bytes][span: 8 bytes][payload: ...]
 */

import { chunkAddress } from "./bmt.js";
import { keccak256, concatBytes, bytesEqual } from "./utils.js";

const IDENTIFIER_SIZE = 32;
const SIGNATURE_SIZE = 65;
const SPAN_SIZE = 8;

const SOC_SIGNATURE_OFFSET = IDENTIFIER_SIZE;
const SOC_SPAN_OFFSET = IDENTIFIER_SIZE + SIGNATURE_SIZE;

export interface VerifiedSOC {
  /** The 32-byte identifier. */
  identifier: Uint8Array;
  /** The 65-byte Ethereum signature (r + s + v). */
  signature: Uint8Array;
  /** The recovered 20-byte Ethereum address of the owner. */
  owner: Uint8Array;
  /** The inner CAC data (span + payload). */
  chunkData: Uint8Array;
  /** The SOC address = keccak256(identifier || owner). */
  address: Uint8Array;
}

/**
 * Recover the Ethereum address from a secp256k1 signature.
 *
 * This works in both Node.js (using the built-in `crypto` via `@noble/secp256k1`
 * pattern) and browsers. We use a minimal recovery implementation.
 *
 * Supports @noble/secp256k1 v2 and v3.
 */
async function ecRecover(
  digest: Uint8Array,
  signature: Uint8Array,
): Promise<Uint8Array> {
  // signature is 65 bytes: r (32) + s (32) + v (1)
  const v = signature[64];
  const recoveryBit = v >= 27 ? v - 27 : v;

  try {
    // @ts-ignore — optional peer dependency, resolved at runtime
    const mod = await import("@noble/secp256k1");

    // ── v3 API: recoverPublicKeyAsync(sig65, msgHash) ──
    const recoverAsync = mod.recoverPublicKeyAsync as
      | ((sig: Uint8Array, msg: Uint8Array) => Promise<Uint8Array>)
      | undefined;
    const PointClass = mod.Point as
      | { fromBytes(b: Uint8Array): { toBytes(uncompressed: boolean): Uint8Array } }
      | undefined;

    if (typeof recoverAsync === "function" && PointClass) {
      // Build 65-byte recoverable signature (r‖s‖recovery)
      const sig65 = new Uint8Array(65);
      sig65.set(signature.slice(0, 64));
      sig65[64] = recoveryBit;
      const compressed = await recoverAsync(sig65, digest);
      const pubKey = PointClass.fromBytes(compressed).toBytes(false);
      return keccak256(pubKey.slice(1)).slice(12);
    }

    // ── v2 API: Signature.fromCompact(64).addRecoveryBit(v).recoverPublicKey(msg) ──
    const Signature =
      (mod as Record<string, unknown>).Signature ??
      ((mod as Record<string, unknown>).default as Record<string, unknown>)
        ?.Signature;
    if (Signature) {
      const sig = (
        Signature as {
          fromCompact: (
            hex: Uint8Array,
          ) => { addRecoveryBit: (v: number) => { recoverPublicKey: (msg: Uint8Array) => { toRawBytes: (uncompressed: boolean) => Uint8Array } } };
        }
      ).fromCompact(signature.slice(0, 64));
      const pubKey = sig
        .addRecoveryBit(recoveryBit)
        .recoverPublicKey(digest)
        .toRawBytes(false);
      return keccak256(pubKey.slice(1)).slice(12);
    }

    throw new Error("Unsupported @noble/secp256k1 version");
  } catch (e) {
    if (e instanceof Error && e.message.includes("Unsupported")) throw e;
    throw new Error(
      "SOC verification requires @noble/secp256k1. Install it: npm install @noble/secp256k1",
    );
  }
}

/**
 * Verify a Single Owner Chunk.
 *
 * @param data    Raw SOC data: identifier(32) + signature(65) + span(8) + payload
 * @param address The expected 32-byte SOC address
 * @returns Verified SOC, or throws on failure
 */
export async function verifySingleOwnerChunk(
  data: Uint8Array,
  address: Uint8Array,
): Promise<VerifiedSOC> {
  if (data.length < SOC_SPAN_OFFSET + SPAN_SIZE) {
    throw new Error(
      `SOC data too small: ${data.length} bytes`,
    );
  }

  const identifier = data.slice(0, IDENTIFIER_SIZE);
  const signature = data.slice(SOC_SIGNATURE_OFFSET, SOC_SPAN_OFFSET);
  const cacData = data.slice(SOC_SPAN_OFFSET); // span + payload

  // 1. Compute the inner CAC address
  const cacAddr = chunkAddress(cacData);

  // 2. Build the digest that was signed: identifier || cacAddress
  const digest = keccak256(concatBytes(identifier, cacAddr));

  // 3. Recover the owner's Ethereum address from the signature
  const owner = await ecRecover(digest, signature);

  // 4. Compute expected SOC address: keccak256(identifier || owner)
  const expectedAddr = keccak256(concatBytes(identifier, owner));

  // 5. Verify the address matches
  if (!bytesEqual(expectedAddr, address)) {
    throw new Error(
      "SOC verification failed: recovered address does not match expected SOC address",
    );
  }

  return {
    identifier,
    signature,
    owner,
    chunkData: cacData,
    address: expectedAddr,
  };
}

/**
 * Compute a SOC address from an identifier and owner address.
 */
export function socAddress(
  identifier: Uint8Array,
  owner: Uint8Array,
): Uint8Array {
  return keccak256(concatBytes(identifier, owner));
}

/**
 * Compute a feed identifier from a topic and index.
 * identifier = keccak256(topic || indexBytes)
 */
export function feedIdentifier(
  topic: Uint8Array,
  index: bigint,
): Uint8Array {
  const indexBytes = new Uint8Array(32);
  // Write index as big-endian uint256
  let v = index;
  for (let i = 31; i >= 0; i--) {
    indexBytes[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return keccak256(concatBytes(topic, indexBytes));
}
