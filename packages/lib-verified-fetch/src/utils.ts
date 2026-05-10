/**
 * Keccak-256 hashing utilities.
 * Works in both Node.js and browsers.
 */

import { keccak256 as keccak } from "js-sha3";

/** Compute keccak256 of arbitrary binary data, returning 32 bytes. */
export function keccak256(data: Uint8Array): Uint8Array {
  return new Uint8Array(keccak.arrayBuffer(data));
}

/** Concatenate multiple Uint8Arrays into one. */
export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let totalLength = 0;
  for (const a of arrays) totalLength += a.length;
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

/** Check if two byte arrays are equal. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Convert a hex string to bytes. */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  if (hex.length % 2 !== 0) throw new Error("Hex string must have even length");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/** Convert bytes to hex string. */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/** Write a 64-bit little-endian unsigned integer into an 8-byte buffer. */
export function writeUint64LE(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let v = value;
  for (let i = 0; i < 8; i++) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return buf;
}

/** Read a 64-bit little-endian unsigned integer from an 8-byte buffer. */
export function readUint64LE(buf: Uint8Array): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i--) {
    value = (value << 8n) | BigInt(buf[i]);
  }
  return value;
}
