# swarm-verified-fetch

Fetch and verify data from any Swarm gateway — without running a full node.

Downloading from Swarm without your own Bee node means trusting a public gateway. This library closes that gap: download from any gateway, then verify client-side by recomputing content hashes — the same way a Bee node does internally.

Works in **Node.js** and **browsers**. Zero runtime dependencies beyond `js-sha3`.

## Install

```bash
npm install swarm-verified-fetch
```

For SOC/feed verification (optional):

```bash
npm install @noble/secp256k1
```

## Quick Start

```ts
import { verifiedFetch } from "swarm-verified-fetch";

// Fetch and verify immutable content
const res = await verifiedFetch("abc123..."); // 64-char hex reference

console.log(res.verified); // true — BMT hash verified
console.log(res.text());   // decoded UTF-8 content
console.log(res.json());   // parsed JSON
console.log(res.bytes());  // raw Uint8Array
```

## API

### `verifiedFetch(reference, options?)`

Download and verify an immutable Swarm file (single-chunk or multi-chunk).

Every chunk in the Merkle tree is downloaded via the `/chunks/` endpoint, its BMT hash is recomputed, and compared to the expected reference. Tampered data is rejected immediately.

```ts
const res = await verifiedFetch("abc123...", {
  gateway: "https://gateway.ethswarm.org",   // default
  timeout: 30_000,                           // ms, default
  verify: "full",                            // "full" | "none"
});
```

**Returns** a `VerifiedResponse` with:

| Property      | Type         | Description                       |
| ------------- | ------------ | --------------------------------- |
| `verified`    | `boolean`    | `true` if BMT verification passed |
| `reference`   | `string`     | The Swarm reference (hex)         |
| `contentType` | `string\|null` | Content-Type header if available |
| `data`        | `Uint8Array` | Raw bytes                         |
| `text()`      | `string`     | UTF-8 decoded content             |
| `json<T>()`   | `T`          | Parsed JSON                       |
| `bytes()`     | `Uint8Array` | Raw bytes (alias for `.data`)     |

### `verifiedFetchSOC(reference, options?)`

Download and verify a **Single Owner Chunk** (feed update). Recovers the Ethereum signer address and verifies the SOC address.

Requires `@noble/secp256k1` as a peer dependency.

```ts
import { verifiedFetchSOC } from "swarm-verified-fetch";

const soc = await verifiedFetchSOC("def456...");
console.log(soc.owner);      // 20-byte Ethereum address
console.log(soc.identifier); // 32-byte identifier
console.log(soc.chunkData);  // inner CAC data (span + payload)
```

### `verifyChunk(data, reference)`

Verify a chunk you already have, without downloading.

```ts
import { verifyChunk } from "swarm-verified-fetch";

const isValid = verifyChunk(rawChunkData, "abc123...");
// true if keccak256(span || bmtRoot(payload)) matches the reference
```

### Gateway Fallback

Pass multiple gateways for resilience. If the first gateway fails (network error, HTTP error), the next one is tried automatically. Verification failures (tampered data) are **not** retried.

```ts
const res = await verifiedFetch("abc123...", {
  gateways: [
    "https://gateway.ethswarm.org",
    "https://bee-0.gateway.ethswarm.org",
    "http://localhost:1633",
  ],
});
```

### Options

```ts
interface VerifiedFetchOptions {
  gateway?: string;          // Single gateway URL (default: "https://gateway.ethswarm.org")
  gateways?: string[];       // Multiple gateways for fallback (overrides `gateway`)
  timeout?: number;          // Request timeout in ms (default: 30000)
  fetch?: typeof fetch;      // Custom fetch implementation
  verify?: "full" | "none";  // Verification mode (default: "full")
}
```

## Low-Level Utilities

All cryptographic building blocks are exported for direct use:

```ts
import {
  // BMT
  bmtRootHash,                  // BMT root hash of a chunk payload
  chunkAddress,                 // Full chunk address: keccak256(span || bmtRoot)
  SEGMENT_SIZE,                 // 32 bytes
  MAX_CHUNK_PAYLOAD_SIZE,       // 4096 bytes
  SPAN_SIZE,                    // 8 bytes

  // CAC
  verifyContentAddressedChunk,  // Verify raw chunk data against expected address
  makeChunkData,                // Build raw chunk data from payload + optional span

  // SOC / Feeds
  verifySingleOwnerChunk,       // Verify a SOC (requires @noble/secp256k1)
  socAddress,                   // Compute SOC address: keccak256(identifier || owner)
  feedIdentifier,               // Compute feed identifier: keccak256(topic || index)

  // Crypto helpers
  keccak256,
  hexToBytes,
  bytesToHex,
  concatBytes,
  bytesEqual,
} from "swarm-verified-fetch";
```

## How It Works

### Immutable Data (CAC + BMT)

Swarm stores files as a Merkle tree of **4 KiB chunks**:

1. **Leaf chunks** hold raw data (up to 4096 bytes) prefixed with an 8-byte little-endian span
2. **Intermediate chunks** hold 32-byte child references (up to 128 per chunk)
3. Each chunk's **address** = `keccak256(span || bmtRoot(payload))`, where `bmtRoot` is a Binary Merkle Tree hash over 32-byte segments

To verify: download each chunk, recompute its BMT hash, and check it matches the expected reference. If any chunk fails, the data has been tampered with.

```
Root chunk (span = file_size)
├── Child ref 0 → Leaf (span = 4096, payload = bytes[0..4095])
├── Child ref 1 → Leaf (span = 4096, payload = bytes[4096..8191])
└── Child ref 2 → Leaf (span = remainder)
```

### Mutable Data (SOC / Feeds)

A **Single Owner Chunk** binds an identifier to an Ethereum signature:

```
SOC layout: [identifier: 32] [signature: 65] [span: 8] [payload: ...]
SOC address = keccak256(identifier || ownerAddress)
```

The signature covers `keccak256(identifier || innerCACAddress)`. To verify:
1. Compute the inner CAC address from span+payload
2. Recover the signer's Ethereum address from the signature
3. Check that `keccak256(identifier || recoveredAddress)` equals the SOC address

**Feeds** are sequences of SOCs where the identifier is derived from a topic and index:
```
feedIdentifier = keccak256(topic || index)
```

## Browser Support

The library uses only:
- `Uint8Array`, `ArrayBuffer` — universal
- `TextDecoder` — universal  
- `fetch()` — available in all modern browsers (or pass a custom implementation)
- `js-sha3` for keccak256 — pure JS, works everywhere

No Node.js-specific APIs are used in the core library. `@noble/secp256k1` (for SOC verification) is also pure JS.

## Testing

```bash
npm test          # run all tests
npm run test:watch # watch mode
```

The test suite covers:
- **BMT hashing**: padding, root hash, chunk address computation
- **CAC verification**: valid chunks, tampered data, wrong addresses, size limits
- **SOC verification**: valid SOCs, tampered payload/signature, wrong owner, address computation
- **Feed identifiers**: determinism, topic/index independence
- **verifiedFetch**: single-chunk files, multi-chunk files, tampered data detection, unverified mode
- **Gateway fallback**: retry on network failure, no retry on verification failure
- **Utilities**: keccak256, hex/bytes conversion, uint64 LE encoding

## Scope & Limitations

- **Full file support**: handles both single-chunk (≤4096 bytes) and multi-chunk files of arbitrary size via Merkle tree traversal
- **Sequential chunk download**: chunks are downloaded sequentially; parallel download is a future optimization
- **No upload**: this is a read-only verification library
- **SOC verification** requires `@noble/secp256k1` as an optional peer dependency

## License

MIT
