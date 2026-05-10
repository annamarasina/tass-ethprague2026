/**
 * swarm-verified-fetch
 *
 * Fetch and verify data from any Swarm gateway — without running a full node.
 * Works in both Node.js and browsers.
 *
 * Usage:
 *   import { verifiedFetch } from "swarm-verified-fetch";
 *   const response = await verifiedFetch("abc123...");
 *   const data = await response.text();
 */

export { bmtRootHash, chunkAddress, SEGMENT_SIZE, MAX_CHUNK_PAYLOAD_SIZE, SPAN_SIZE } from "./bmt.js";
export { verifyContentAddressedChunk, makeChunkData, type VerifiedChunk } from "./cac.js";
export { verifySingleOwnerChunk, socAddress, feedIdentifier, type VerifiedSOC } from "./soc.js";
export { keccak256, hexToBytes, bytesToHex, concatBytes, bytesEqual } from "./utils.js";

import { chunkAddress, SPAN_SIZE, MAX_CHUNK_PAYLOAD_SIZE } from "./bmt.js";
import { verifyContentAddressedChunk } from "./cac.js";
import { verifySingleOwnerChunk } from "./soc.js";
import { hexToBytes, bytesToHex, bytesEqual, concatBytes, readUint64LE, keccak256 } from "./utils.js";

// ─── Types ───────────────────────────────────────────────

/** Options for verifiedFetch. */
export interface VerifiedFetchOptions {
  /** Gateway base URL. Defaults to "https://gateway.ethswarm.org". */
  gateway?: string;
  /**
   * List of gateway URLs to try in order. If the first fails, the next is tried.
   * Overrides `gateway` when provided.
   */
  gateways?: string[];
  /** Request timeout in milliseconds. Defaults to 30_000. */
  timeout?: number;
  /** Custom fetch implementation (for testing or environments without global fetch). */
  fetch?: typeof globalThis.fetch;
  /**
   * Verification mode:
   * - "full" (default): download raw chunks, recompute BMT hash, compare to reference
   * - "none": skip verification (trust the gateway)
   */
  verify?: "full" | "none";
}

/** A verified response wrapping the downloaded data. */
export class VerifiedResponse {
  /** Whether the data passed BMT verification. */
  readonly verified: boolean;
  /** The raw bytes of the content. */
  readonly data: Uint8Array;
  /** The Swarm reference (hex). */
  readonly reference: string;
  /** Content type if known. */
  readonly contentType: string | null;

  constructor(
    data: Uint8Array,
    reference: string,
    verified: boolean,
    contentType: string | null = null,
  ) {
    this.data = data;
    this.reference = reference;
    this.verified = verified;
    this.contentType = contentType;
  }

  /** Decode the data as UTF-8 text. */
  text(): string {
    return new TextDecoder().decode(this.data);
  }

  /** Parse the data as JSON. */
  json<T = unknown>(): T {
    return JSON.parse(this.text()) as T;
  }

  /** Get the raw bytes. */
  bytes(): Uint8Array {
    return this.data;
  }
}

// ─── Constants ───────────────────────────────────────────

const DEFAULT_GATEWAY = "https://gateway.ethswarm.org";
const DEFAULT_TIMEOUT = 30_000;
const REFERENCE_HEX_LENGTH = 64;

// Swarm chunk sizes
const CHUNK_DATA_SIZE = SPAN_SIZE + MAX_CHUNK_PAYLOAD_SIZE; // 4104
const BRANCHES = MAX_CHUNK_PAYLOAD_SIZE / 32; // 128 references per intermediate chunk

// ─── Internal helpers ────────────────────────────────────

function normalizeRef(ref: string): string {
  const hex = ref.startsWith("0x") ? ref.slice(2) : ref;
  if (hex.length !== REFERENCE_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Invalid Swarm reference: "${ref}" (expected 64 hex chars)`);
  }
  return hex.toLowerCase();
}

async function fetchBytes(
  url: string,
  fetchFn: typeof globalThis.fetch,
  timeout: number,
): Promise<{ data: Uint8Array; contentType: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Gateway returned HTTP ${res.status}: ${res.statusText}`);
    }
    const buf = await res.arrayBuffer();
    const contentType = res.headers.get("content-type");
    return { data: new Uint8Array(buf), contentType };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Core: single-chunk verification ─────────────────────

/**
 * Download a single chunk from the gateway(s) and verify its address.
 * Tries each gateway in order; throws the last error if all fail.
 */
async function downloadAndVerifyChunk(
  ref: Uint8Array,
  gateways: string[],
  fetchFn: typeof globalThis.fetch,
  timeout: number,
): Promise<Uint8Array> {
  const refHex = bytesToHex(ref);
  let lastError: Error | undefined;

  for (const gw of gateways) {
    try {
      const url = `${gw}/chunks/${refHex}`;
      const { data } = await fetchBytes(url, fetchFn, timeout);

      if (data.length < SPAN_SIZE + 1) {
        throw new Error(`Chunk ${refHex} too small: ${data.length} bytes`);
      }

      // Verify: recompute address from the data and compare to expected ref
      const computed = chunkAddress(data);
      if (!bytesEqual(computed, ref)) {
        throw new Error(
          `Chunk verification FAILED for ${refHex}: ` +
          `computed ${bytesToHex(computed)} ≠ expected ${refHex}`,
        );
      }

      return data;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Verification failures should not be retried on other gateways
      if (lastError.message.includes("verification FAILED")) throw lastError;
    }
  }

  throw lastError ?? new Error(`Failed to download chunk ${refHex}`);
}

// ─── Core: multi-chunk reassembly with verification ──────

/**
 * Recursively download and verify a Swarm file.
 *
 * Swarm files are stored as a Merkle tree of chunks:
 * - Leaf chunks contain raw data (up to 4096 bytes)
 * - Intermediate chunks contain references (32 bytes each, up to 128 per chunk)
 * - The root chunk's span tells us the total content size
 *
 * We walk the tree, verify every chunk, and reassemble the payload.
 */
async function resolveChunkTree(
  ref: Uint8Array,
  gateways: string[],
  fetchFn: typeof globalThis.fetch,
  timeout: number,
): Promise<Uint8Array> {
  const data = await downloadAndVerifyChunk(ref, gateways, fetchFn, timeout);
  const span = readUint64LE(data.slice(0, SPAN_SIZE));
  const payload = data.slice(SPAN_SIZE);

  // A leaf chunk's span equals its payload length (or less, for the last chunk).
  // An intermediate chunk's span exceeds its payload because the payload
  // contains child references (32 bytes each), not the actual data.
  const isLeaf =
    span <= BigInt(payload.length) ||
    (payload.length > 0 && payload.length % 32 !== 0);

  if (isLeaf) {
    return payload.slice(0, Number(span));
  }

  // Otherwise this is an intermediate chunk whose payload is a list of
  // 32-byte child references. Each child covers a sub-range of the file.
  const childCount = Math.ceil(payload.length / 32);
  const childRefs: Uint8Array[] = [];
  for (let i = 0; i < childCount; i++) {
    childRefs.push(payload.slice(i * 32, (i + 1) * 32));
  }

  // Recursively resolve each child
  const childBuffers: Uint8Array[] = [];
  for (const childRef of childRefs) {
    const childData = await resolveChunkTree(childRef, gateways, fetchFn, timeout);
    childBuffers.push(childData);
  }

  // Concatenate all child data, trim to total span
  const assembled = concatBytes(...childBuffers);
  return assembled.slice(0, Number(span));
}

// ─── Public API ──────────────────────────────────────────

/**
 * Fetch data from a Swarm gateway and verify its integrity client-side.
 *
 * For immutable data, this recomputes the BMT hash of every chunk in
 * the Merkle tree and checks it against the expected reference.
 *
 * @param reference  A 64-char hex Swarm reference (content hash)
 * @param options    Gateway URL, timeout, verification mode
 * @returns A VerifiedResponse with the data
 *
 * @example
 * ```ts
 * import { verifiedFetch } from "swarm-verified-fetch";
 *
 * const res = await verifiedFetch("abc123...");
 * console.log(res.verified); // true
 * const text = res.text();
 * const json = res.json();
 * ```
 */
export async function verifiedFetch(
  reference: string,
  options: VerifiedFetchOptions = {},
): Promise<VerifiedResponse> {
  const {
    gateway = DEFAULT_GATEWAY,
    gateways: gatewayList,
    timeout = DEFAULT_TIMEOUT,
    fetch: fetchFn = globalThis.fetch,
    verify = "full",
  } = options;

  const gateways = gatewayList ?? [gateway];
  const refHex = normalizeRef(reference);

  if (verify === "none") {
    // Unverified mode: use the bzz endpoint, try gateways in order
    let lastError: Error | undefined;
    for (const gw of gateways) {
      try {
        const url = `${gw}/bzz/${refHex}`;
        const { data, contentType } = await fetchBytes(url, fetchFn, timeout);
        return new VerifiedResponse(data, refHex, false, contentType);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw lastError ?? new Error(`All gateways failed for ${refHex}`);
  }

  // Verified mode: download chunks and verify the full Merkle tree
  const refBytes = hexToBytes(refHex);
  const payload = await resolveChunkTree(refBytes, gateways, fetchFn, timeout);

  return new VerifiedResponse(payload, refHex, true);
}

/**
 * Verify a chunk that has already been downloaded.
 * Useful if you have raw chunk data from another source.
 *
 * @param data      Raw chunk data (span + payload)
 * @param reference Expected 64-char hex reference
 * @returns true if verification passes, false otherwise
 */
export function verifyChunk(data: Uint8Array, reference: string): boolean {
  const refHex = normalizeRef(reference);
  const refBytes = hexToBytes(refHex);
  const computed = chunkAddress(data);
  return bytesEqual(computed, refBytes);
}

/**
 * Verify a Single Owner Chunk (SOC) / feed update.
 *
 * Downloads the chunk and verifies the Ethereum signature matches
 * the expected owner address.
 *
 * @param reference  The SOC address (64 hex chars)
 * @param options    Gateway URL, timeout
 * @returns The verified SOC with owner, identifier, and payload
 */
export async function verifiedFetchSOC(
  reference: string,
  options: VerifiedFetchOptions = {},
) {
  const {
    gateway = DEFAULT_GATEWAY,
    gateways: gatewayList,
    timeout = DEFAULT_TIMEOUT,
    fetch: fetchFn = globalThis.fetch,
  } = options;

  const gateways = gatewayList ?? [gateway];
  const refHex = normalizeRef(reference);
  const refBytes = hexToBytes(refHex);

  let lastError: Error | undefined;
  for (const gw of gateways) {
    try {
      const url = `${gw}/chunks/${refHex}`;
      const { data } = await fetchBytes(url, fetchFn, timeout);
      return verifySingleOwnerChunk(data, refBytes);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Signature/verification failures should not be retried
      if (lastError.message.includes("verification failed")) throw lastError;
    }
  }

  throw lastError ?? new Error(`All gateways failed for SOC ${refHex}`);
}
