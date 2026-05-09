# Frontend Developer Phase Protocol

Owner: Frontend Developer

Scope:
- TypeScript VS Code extension scaffold
- command palette entry point
- sidebar WebView dashboard
- live audit log UI
- mock-first agent integration
- audit report rendering
- VS Code diagnostics
- click-to-source findings
- certificate mint UI
- BaseScan and Sourcify links

Working rule:
- Each phase is built independently.
- After each phase, implementation stops for approval.
- No next phase starts until approval is given.
- If backend workstreams are missing or unstable, use mock adapters/fixtures matching the PRD interfaces.
- Frontend should remain demo-runnable after every phase.

## Phase 0: Frontend Protocol and Boundaries

Purpose:
- Lock the frontend build sequence, dependencies, mock strategy, and approval gates.

Deliverables:
- This protocol document.
- Clear phase-by-phase acceptance criteria.
- Clear list of mocked backend dependencies.

Mocked dependencies:
- Backend 1 legal analyzer output can be mocked as `LegalReport`.
- Backend 2 security analyzer output can be mocked as `SecurityReport`.
- Backend 3 certification output can use `MockCertificationService`.

Acceptance criteria:
- Frontend phases are explicit.
- Approval workflow is clear.
- Mock-first strategy is confirmed.

Approval gate:
- Frontend Developer confirms the plan is acceptable.

Status:
- Complete.

## Phase 1: VS Code Extension Scaffold

Purpose:
- Establish the extension shell and entry points.

Files expected:
- `extension/package.json`
- `extension/tsconfig.json`
- `extension/src/extension.ts`
- `extension/src/constants.ts`
- optional root scripts to build/run extension

Implementation tasks:
- Create a TypeScript VS Code extension scaffold.
- Register command: `Pre-Flight Auditor: Run Audit`.
- Register sidebar view: `Pre-Flight Auditor`.
- Add activation events for command and view.
- Add minimal extension logging.

Mocked dependencies:
- No backend dependency required.

Acceptance criteria:
- Extension compiles.
- Command is registered.
- Sidebar provider is registered.
- No WebView dashboard complexity yet.

Approval gate:
- Stop after scaffold compiles.

Status:
- Complete.

## Phase 2: Sidebar WebView Shell

Purpose:
- Build the visual dashboard container and frontend message bridge.

Files expected:
- `extension/src/webview/PreflightViewProvider.ts`
- `extension/src/webview/getWebviewHtml.ts`
- `extension/src/webview/webview.css` or inline stylesheet helper
- `extension/src/webview/webview.js` or bundled equivalent

Implementation tasks:
- Render sidebar WebView.
- Add idle state with selected Solidity file.
- Add `Run Audit` button.
- Add terminal-style log panel.
- Implement VS Code extension <-> WebView message passing.
- Add basic states: `idle`, `running`, `report`, `blocked`, `certified`, `error`.

Mocked dependencies:
- Hardcoded selected file path if no editor is open.
- Mock log stream emitted from extension side.

Acceptance criteria:
- Sidebar opens.
- `Run Audit` button sends a message to extension host.
- Extension host can send logs back to WebView.
- UI is polished enough for demo iteration.

Approval gate:
- Stop after WebView shell is interactive.

Status:
- Complete.

## Phase 3: Mock Audit Orchestrator Integration

Purpose:
- Make the full frontend flow work before real backend modules are ready.

Files expected:
- `extension/src/client/mockAuditClient.ts`
- `extension/src/types.ts`
- optional shared import from `agent/src/interfaces.ts` if practical

Implementation tasks:
- Define frontend-facing `AuditResult`, `AuditLogEvent`, `CertificateResult` types.
- Implement mock audit runner with realistic timed phases:
  - reading local files
  - legal payment
  - Apify scrape
  - security parse
  - Sourcify similarity
  - storage diff
  - report generation
- Render final mock `AuditResult`.
- Support both eligible and blocked mock results.

Mocked dependencies:
- Backend 1, 2, and 3 all mocked.

Acceptance criteria:
- Full audit flow runs from button click.
- Logs stream in order.
- Report renders from structured JSON.
- Blocked and eligible states are both testable.

Approval gate:
- Stop after mock end-to-end audit works.

## Phase 4: Report UI and UX Polish

Purpose:
- Build the demo-quality report dashboard.

Files expected:
- WebView HTML/CSS/JS updates
- optional component helpers if using a bundler

Implementation tasks:
- Render Pre-Flight Score.
- Render legal risk: `low | medium | high`.
- Render similarity percentage.
- Render severity-ranked findings.
- Render storage layout findings.
- Render closest Sourcify/exploit matches.
- Add clear blocked certification state when critical findings exist.
- Add `Mint Certificate` button only when eligible.

Mocked dependencies:
- Continue using mock audit results.

Acceptance criteria:
- Report is readable in a 3-minute demo.
- Critical findings visibly block minting.
- Eligible reports show mint action.
- UI handles narrow sidebar width.

Approval gate:
- Stop after report UI is demo-ready.

## Phase 5: VS Code Diagnostics and Click-to-Line

Purpose:
- Connect findings to source code inside the editor.

Files expected:
- `extension/src/diagnostics/applyDiagnostics.ts`
- `extension/src/diagnostics/jumpToFinding.ts`

Implementation tasks:
- Convert `SecurityFinding` severities into VS Code diagnostics.
- Apply diagnostics to the selected Solidity document.
- Add sidebar finding click events.
- Open file and reveal line range from clicked finding.
- Clear stale diagnostics before each new audit.

Mocked dependencies:
- Use mock findings with deterministic line numbers.

Acceptance criteria:
- Red/yellow/info diagnostics appear in `.sol` file.
- Clicking a finding in WebView jumps to the source line.
- Diagnostics clear or update on rerun.

Approval gate:
- Stop after editor integration works.

## Phase 6: Certification UI Integration

Purpose:
- Wire the frontend mint flow to Backend 3's certification service contract.

Files expected:
- `extension/src/client/certificationClient.ts`
- WebView mint-state updates

Implementation tasks:
- Call mock certification service first.
- Render mint progress logs.
- Render certificate transaction hash.
- Render BaseScan link.
- Render Sourcify verification link.
- Handle mint failure gracefully.
- Disable mint if `certificationEligible === false`.

Mocked dependencies:
- Use `MockCertificationService` until live orchestrator service is ready.

Acceptance criteria:
- Eligible mock report can mint a mock certificate.
- Blocked report cannot mint.
- Certified state displays links.
- Errors are visible but do not crash the extension.

Approval gate:
- Stop after certification UX is integrated.

## Phase 7: Local Agent Service Bridge

Purpose:
- Replace local frontend mocks with a stable bridge to the local Node.js agent service.

Files expected:
- `extension/src/client/agentClient.ts`
- `extension/src/client/processManager.ts`
- optional `agent/src/index.ts` coordination hooks if needed

Implementation tasks:
- Spawn or connect to local Node.js agent service.
- Stream `AuditLogEvent` objects to WebView.
- Send selected file path/source code to agent.
- Receive real `AuditResult`.
- Receive real or mock `CertificateResult`.
- Add fallback to mocks when agent is unavailable.

Mocked dependencies:
- If Backend 1/2 are incomplete, agent can still return mock legal/security reports.

Acceptance criteria:
- Frontend can switch between mock and agent-backed mode.
- Agent failure shows an actionable UI error.
- Mock fallback remains available for demo safety.

Approval gate:
- Stop after bridge works locally.

## Phase 8: Demo Hardening and Final Integration

Purpose:
- Make the frontend reliable for the 3-minute demo.

Implementation tasks:
- Add extension README usage notes.
- Add `.env` setup guidance without exposing secrets.
- Test with `UnsafeVault.sol` and `SafeVault.sol`.
- Verify narrow and normal sidebar layouts.
- Verify command palette and sidebar flows.
- Verify logs are readable and paced.
- Verify all external links open correctly.
- Add final demo checklist.

Mocked dependencies:
- Keep mock mode available as a fallback.

Acceptance criteria:
- Full demo completes under 3 minutes.
- Frontend handles missing `.sol` file gracefully.
- Frontend handles backend errors gracefully.
- No secrets are committed.
- Team can run the frontend from documented commands.

Approval gate:
- Stop and report final frontend status.

## Cross-Team Contracts

Frontend consumes:
- `AuditLogEvent`
- `AuditResult`
- `SecurityFinding`
- `CertificateResult`
- `RegistryVerificationResult`

Frontend produces:
- selected Solidity file path
- selected Solidity source code
- audit start command
- mint certificate command

Temporary assumptions:
- The first frontend implementation uses mocks.
- Selected file is the active VS Code editor document.
- Only one audit runs at a time for MVP.
- Frontend does not manage wallet credentials directly.
- Backend agent owns all x402, RPC, and gas payment execution.

## Approval Format

After each phase, respond with one of:
- `Approved: continue to Phase N`
- `Request changes: ...`
- `Pause`

No future phase starts until approval is received.
