# Backend Developer 3 Phase Protocol

Owner: Backend Developer 3

Scope:
- `AuditRegistry.sol`
- Foundry project setup
- Base Sepolia deployment flow
- Sourcify verification for `AuditRegistry.sol`
- TypeScript certification service
- mock integration points until frontend/orchestrator interfaces are available

Working rule:
- Each phase is built independently.
- After each phase, implementation stops for approval.
- No next phase starts until approval is given.
- If another developer's module is missing, use a mock adapter or fixture matching the PRD interfaces.

## Phase 0: Protocol and Boundaries

Purpose:
- Lock the implementation sequence, phase gates, dependencies, and approval process.

Deliverables:
- This protocol document.
- Clear list of mocked dependencies.
- Clear phase-by-phase acceptance criteria.

Approval gate:
- Backend Developer 3 confirms the phase plan is acceptable.

Status:
- Complete.

## Phase 1: Foundry Contract Scaffold

Purpose:
- Create the smart contract workspace and implement the MVP registry contract.

Files expected:
- `contracts/foundry.toml`
- `contracts/src/AuditRegistry.sol`
- `contracts/test/AuditRegistry.t.sol`
- `contracts/script/Deploy.s.sol`

Implementation tasks:
- Initialize Foundry-compatible project structure under `contracts/`.
- Implement `AuditRegistry.sol`.
- Store certificates as `mapping(address => Certificate[])`.
- Restrict `issueCertificate()` to the immutable `authorizedAgent`.
- Emit `CertificateIssued`.
- Return deterministic `certificateHash` from `issueCertificate()`.

Mocked dependencies:
- Agent wallet address can be passed as a constructor argument in tests.
- No frontend/orchestrator dependency required.

Acceptance criteria:
- Contract compiles.
- Tests cover successful issuance.
- Tests cover unauthorized caller revert.
- Tests cover stored certificate fields.
- Tests cover emitted event.

Approval gate:
- Stop after tests pass or after reporting any blocker.

Status:
- Complete.

## Phase 2: Deployment Configuration

Purpose:
- Make the registry deployable to Base Sepolia through Foundry.

Files expected:
- `contracts/script/Deploy.s.sol`
- `contracts/.env.example` or root `.env.example` updates
- optional `contracts/README.md` deployment notes

Implementation tasks:
- Add deployment script using `AGENT_ADDRESS`.
- Document required env vars:
  - `BASE_SEPOLIA_RPC_URL`
  - `PRIVATE_KEY`
  - `AGENT_ADDRESS`
  - `ETHERSCAN_API_KEY` if Foundry verification is used as fallback
- Add commands for local compile, test, and deploy.
- Avoid committing private keys or live `.env`.

Mocked dependencies:
- Use a placeholder `AGENT_ADDRESS` in docs.
- Do not require the actual funded wallet until live deployment.

Acceptance criteria:
- `forge script` command is documented.
- Deployment script compiles.
- Constructor argument is wired correctly.
- No secrets are committed.

Approval gate:
- Stop before any live deployment unless explicitly approved.

## Phase 3: TypeScript Certification Service Mock

Purpose:
- Provide the frontend/orchestrator with a stable certification module before live chain integration.

Files expected:
- `agent/src/tools/certification/CertificationService.ts`
- `agent/src/tools/certification/MockCertificationService.ts`
- shared interface import path if available, otherwise local temporary types

Implementation tasks:
- Implement the `CertificationService` interface from the PRD.
- Implement `MockCertificationService`.
- Return realistic Base Sepolia transaction and Sourcify URLs.
- Enforce `auditResult.certificationEligible === true` in the mock.

Mocked dependencies:
- If `agent/src/interfaces.ts` does not exist yet, create minimal local types or a shared `agent/src/interfaces.ts` containing only the required PRD interfaces.
- Use mock `AuditResult` input shape until Backend 1/2 outputs exist.

Acceptance criteria:
- TypeScript compiles if project tooling exists.
- Mock service returns `CertificateResult`.
- Mock service refuses ineligible audit results.
- Frontend can integrate without blockchain availability.

Approval gate:
- Stop after mock service is ready.

## Phase 4: Live Registry Certification Service

Purpose:
- Replace mock minting with a real Base Sepolia transaction.

Files expected:
- `agent/src/tools/certification/RegistryCertificationService.ts`
- `agent/src/tools/certification/abi/AuditRegistry.json` or generated ABI path
- `.env.example` updates if needed

Implementation tasks:
- Use the agent private key from env.
- Connect to `BASE_SEPOLIA_RPC_URL`.
- Read `AUDIT_REGISTRY_ADDRESS`.
- Call `issueCertificate(subject, codeHash, totalScore, reportUri)`.
- Wait for receipt.
- Extract `CertificateIssued` event if available.
- Return `CertificateResult`.

Mocked dependencies:
- If the orchestrator does not provide `subject`, use agent wallet address as MVP subject.
- If report storage is not finalized, use local `reportUri` from `AuditResult`.

Acceptance criteria:
- Service validates required env vars.
- Service blocks ineligible audit results.
- Service submits a real transaction when configured.
- Service returns BaseScan URL.
- Errors are surfaced with actionable messages.

Approval gate:
- Stop before live transaction testing unless explicitly approved.

## Phase 5: Sourcify Verification Service

Purpose:
- Verify `AuditRegistry.sol` through Sourcify and expose the result to the UI.

Files expected:
- `agent/src/tools/certification/RegistryCertificationService.ts`
- optional `agent/src/tools/certification/SourcifyVerifier.ts`

Implementation tasks:
- Implement `verifyRegistry()`.
- Submit required metadata/source payload to Sourcify v2 verification endpoint.
- Return `RegistryVerificationResult`.
- Provide Sourcify URL when verified or partially verified.
- Log verification status through `AuditLogEvent`.

Mocked dependencies:
- If Sourcify v2 payload details are blocked, preserve interface and add a mock verifier behind a flag.

Acceptance criteria:
- Verification method returns `verified`, `partial`, or `failed`.
- UI-friendly Sourcify URL is returned when available.
- Verification failure does not break certificate minting.
- Error details are preserved.

Approval gate:
- Stop after verification implementation or blocker report.

## Phase 6: End-to-End Backend 3 Demo Flow

Purpose:
- Prove Backend Developer 3's whole slice works independently.

Implementation tasks:
- Run contract tests.
- Deploy or use existing `AUDIT_REGISTRY_ADDRESS`.
- Verify registry with Sourcify.
- Mint certificate with a mocked eligible `AuditResult`.
- Mint attempt with an ineligible `AuditResult` must fail before chain call.

Mocked dependencies:
- Use a local mock `AuditResult` fixture if Backend 1/2 are not integrated.

Acceptance criteria:
- `forge test` passes.
- TypeScript certification mock works.
- Live service is ready for funded-wallet testing.
- Sourcify verification path is callable.
- Clear instructions exist for frontend/orchestrator integration.

Approval gate:
- Stop and report final Backend 3 status.

## Cross-Team Contracts

Backend 3 consumes:
- `AuditResult.certificationEligible`
- `AuditResult.codeHash`
- `AuditResult.totalScore`
- `AuditResult.reportUri`
- `AuditResult.auditId`

Backend 3 produces:
- `CertificateResult`
- `RegistryVerificationResult`
- `AuditLogEvent` updates during minting and verification

Temporary assumptions:
- `subject` defaults to the agent wallet address unless the orchestrator later passes a user wallet or project owner address.
- `reportUri` is local for MVP unless another developer adds IPFS, Arweave, or hosted storage.
- Base Sepolia is the only chain for MVP.

## Approval Format

After each phase, respond with one of:
- `Approved: continue to Phase N`
- `Request changes: ...`
- `Pause`

No future phase starts until approval is received.
