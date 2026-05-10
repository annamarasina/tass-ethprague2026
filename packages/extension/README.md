# Solid Scan VS Code Extension

Frontend MVP for the Solid Scan hackathon demo.

## What Works

- Command Palette command: `Solid Scan: Run Audit`
- Activity bar sidebar: `Solid Scan`
- WebView dashboard with live audit logs
- Mock audit flow with eligible and blocked results
- Report UI with score, legal risk, similarity, findings, storage layout, and Sourcify matches
- VS Code diagnostics for security findings
- Clickable findings that jump to Solidity source lines
- Mock certificate minting flow with BaseScan and Sourcify links
- Local agent bridge with mock fallback

## Run Locally

Install dependencies:

```bash
npm install --prefix extension
```

Compile:

```bash
npm run compile --prefix extension
```

Open this repository in VS Code, then run the extension using the VS Code extension development host.

Suggested demo files:

- `extension/demo/SafeVault.sol`
- `extension/demo/UnsafeVault.sol`

Open one of those `.sol` files, then run:

```text
Solid Scan: Run Audit
```

## Mock vs Agent Mode

Default mode is mock-safe and requires no backend agent:

```bash
unset PREFLIGHT_AGENT_MODE
```

To attempt local agent mode:

```bash
PREFLIGHT_AGENT_MODE=live
```

The frontend looks for:

```text
agent/dist/index.js
```

If the agent entrypoint is missing or fails, the frontend logs an actionable warning and falls back to mock audit results.

## Environment Guidance

Do not commit `.env` files. The root `.gitignore` ignores `.env` and `.env.*`, while keeping `.env.example` tracked.

For live Backend 3 flows, use the root `.env.example` as the template and fill:

```bash
BASE_SEPOLIA_RPC_URL=
AGENT_PRIVATE_KEY=
AUDIT_REGISTRY_ADDRESS=
AUDIT_REGISTRY_CREATION_TX_HASH=
SOURCIFY_API_BASE=https://sourcify.dev/server
```

The frontend does not directly manage wallet secrets. The local agent/backend owns RPC, x402, and gas execution.

## Demo Checklist

1. Compile the extension.
2. Open `SafeVault.sol`.
3. Run `Solid Scan: Run Audit`.
4. Verify live logs stream into the sidebar.
5. Verify report shows eligible state.
6. Click `Mint Certificate`.
7. Verify certified state shows certificate hash, BaseScan, and Sourcify links.
8. Open `UnsafeVault.sol`.
9. Run audit again.
10. Verify critical finding blocks minting.
11. Click a security finding and confirm VS Code jumps to the source line.
