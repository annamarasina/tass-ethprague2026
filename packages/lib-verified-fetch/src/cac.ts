/**
 * Content Addressed Chunk (CAC) verification.
 *
 * A CAC holds up to 4096 bytes. Its address is entirely determined by
 * the content: address = keccak256(span || bmtRoot(payload)).
 *
 * To verify, recompute the address from the raw chunk data and compare
 * it against the expected reference.
 */

import {
  chunkAddress,
  MAX_CHUNK_PAYLOAD_SIZE,
  SPAN_SIZE,
} from "./bmt.js";
import { bytesEqual, concatBytes, writeUint64LE } from "./utils.js";

export const MIN_PAYLOAD_SIZE = 1;

export interface VerifiedChunk {
  /** Raw chunk data (span + payload). */
  data: Uint8Array;
  /** The 8-byte little-endian span. */
  span: Uint8Array;
  /** The payload bytes (up to 4096). */
  payload: Uint8Array;
  /** The verified 32-byte chunk address. */
  address: Uint8Array;
}

/**
 * Verify a content-addressed chunk.
 *
 * @param data     Raw chunk data (span + payload) as returned by the gateway
 * @param expected The expected 32-byte reference (chunk address)
 * @returns The verified chunk, or throws if verification fails
 */
export function verifyContentAddressedChunk(
  data: Uint8Array,
  expected: Uint8Array,
): VerifiedChunk {
  if (data.length < SPAN_SIZE + MIN_PAYLOAD_SIZE) {
    throw new Error(
      `Chunk data too small: ${data.length} bytes (minimum ${SPAN_SIZE + MIN_PAYLOAD_SIZE})`,
    );
  }

  const payloadLength = data.length - SPAN_SIZE;
  if (payloadLength > MAX_CHUNK_PAYLOAD_SIZE) {
    throw new Error(
      `Payload exceeds max size: ${payloadLength} > ${MAX_CHUNK_PAYLOAD_SIZE}`,
    );
  }

  const computed = chunkAddress(data);
  if (!bytesEqual(computed, expected)) {
    throw new Error(
      "Chunk verification failed: computed address does not match expected reference",
    );
  }

  return {
    data,
    span: data.slice(0, SPAN_SIZE),
    payload: data.slice(SPAN_SIZE),
    address: computed,
  };
}

/**
 * Build raw chunk data from a payload and optional span.
 * If span is omitted, it defaults to payload.length.
 */
export function makeChunkData(
  payload: Uint8Array,
  span?: bigint,
): Uint8Array {
  if (payload.length < MIN_PAYLOAD_SIZE || payload.length > MAX_CHUNK_PAYLOAD_SIZE) {
    throw new RangeError(
      `Payload size ${payload.length} out of range [${MIN_PAYLOAD_SIZE}, ${MAX_CHUNK_PAYLOAD_SIZE}]`,
    );
  }
  const spanBytes = writeUint64LE(span ?? BigInt(payload.length));
  return concatBytes(spanBytes, payload);
}
