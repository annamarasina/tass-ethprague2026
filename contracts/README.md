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
```

## Foundry Verification Fallback

Sourcify verification is implemented in a later Backend Developer 3 phase. If a manual Foundry fallback is needed during the demo, use:

```bash
forge verify-contract \
  --verifier sourcify \
  --chain-id 84532 \
  "$AUDIT_REGISTRY_ADDRESS" \
  src/AuditRegistry.sol:AuditRegistry
```

