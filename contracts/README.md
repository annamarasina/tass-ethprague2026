# AuditRegistry Deployment

This folder contains the Foundry workspace for Backend Developer 3.

## Required Env Vars

Copy the root `.env.example` to `.env` and fill:

```bash
BASE_SEPOLIA_RPC_URL=
PRIVATE_KEY=
AGENT_ADDRESS=
```

Notes:
- `PRIVATE_KEY` is the deployer key used by `forge script`.
- `AGENT_ADDRESS` is the wallet allowed to call `issueCertificate()`.
- `AGENT_PRIVATE_KEY` is used later by the TypeScript certification service and may be the same wallet as `AGENT_ADDRESS`.
- Never commit `.env` or private keys.

## Commands

Run from this `contracts/` directory.

Compile:

```bash
forge build
```

Test:

```bash
forge test -vv
```

Run the Backend 3 mock demo from the repository root:

```bash
npm run backend3:demo
```

Run the live Backend 3 demo after deployment and env setup:

```bash
npm run backend3:demo:live
```

Dry-run deployment against Base Sepolia:

```bash
source ../.env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$PRIVATE_KEY"
```

Broadcast deployment to Base Sepolia:

```bash
source ../.env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

After deployment, set the deployed registry address in the root `.env`:

```bash
AUDIT_REGISTRY_ADDRESS=0x...
AUDIT_REGISTRY_CREATION_TX_HASH=0x...
```

## Sourcify Verification

The TypeScript certification service verifies the registry through Sourcify API v2:

```text
POST /v2/verify/{chainId}/{address}
GET /v2/verify/{verificationId}
```

For best results, set `AUDIT_REGISTRY_CREATION_TX_HASH` after deployment so Sourcify can resolve the creation bytecode directly.

## Foundry Verification Fallback

If a manual Foundry fallback is needed during the demo, use:

```bash
forge verify-contract \
  --verifier sourcify \
  --chain-id 84532 \
  "$AUDIT_REGISTRY_ADDRESS" \
  src/AuditRegistry.sol:AuditRegistry
```
