/**
 * Binary Merkle Tree (BMT) hasher for Swarm chunks.
 *
 * The BMT chunk address is computed as:
 *   address = keccak256( span || bmtRoot(payload) )
 *
 * where the payload is zero-padded to 4096 bytes, split into 32-byte
 * segments, then reduced pairwise with keccak256 until one 32-byte
 * root hash remains.
 */

import { keccak256, concatBytes } from "./utils.js";

export const SEGMENT_SIZE = 32;
export const MAX_CHUNK_PAYLOAD_SIZE = 4096;
export const SPAN_SIZE = 8;

/**
 * Split data into fixed-size segments.
 * The last segment is kept as-is (caller should have padded).
 */
function partition(data: Uint8Array, size: number): Uint8Array[] {
  const parts: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += size) {
    parts.push(data.slice(i, i + size));
  }
  return parts;
}

/**
 * Pairwise reduce an array of segments with keccak256, halving each
 * round until one root hash remains.
 *
 * This mirrors bee-js `Binary.log2Reduce`.
 */
function log2Reduce(
  segments: Uint8Array[],
  fn: (a: Uint8Array, b: Uint8Array) => Uint8Array,
): Uint8Array {
  let current = segments;
  while (current.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(fn(current[i], current[i + 1]));
    }
    current = next;
  }
  return current[0];
}

/**
 * Compute the BMT root hash of a chunk payload.
 * Payload is zero-padded to 4096 bytes before hashing.
 */
export function bmtRootHash(payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_CHUNK_PAYLOAD_SIZE) {
    throw new RangeError(
      `Payload size ${payload.length} exceeds max chunk size ${MAX_CHUNK_PAYLOAD_SIZE}`,
    );
  }

  // Zero-pad to 4096 bytes
  const padded = new Uint8Array(MAX_CHUNK_PAYLOAD_SIZE);
  padded.set(payload);

  // Split into 32-byte segments (4096 / 32 = 128 segments)
  const segments = partition(padded, SEGMENT_SIZE);

  // Pairwise keccak256 reduce
  return log2Reduce(segments, (a, b) => keccak256(concatBytes(a, b)));
}

/**
 * Compute the full chunk address from raw chunk data (span + payload).
 *
 * This is the canonical Swarm content address:
 *   address = keccak256( span || bmtRoot(payload) )
 */
export function chunkAddress(chunkData: Uint8Array): Uint8Array {
  const span = chunkData.slice(0, SPAN_SIZE);
  const payload = chunkData.slice(SPAN_SIZE);
  const root = bmtRootHash(payload);
  return keccak256(concatBytes(span, root));
}
