# Legal Analyzer Phase Protocol

Owner: Backend Developer 1 / Legal Analyzer

Scope:
- user Solidity code summarization
- intent extraction from code/comments
- ESMA/MiCA legal scraping through the existing scraper path
- optional Swarm upload/fetch of legal knowledge base
- LLM comparison of user intent against legal/regulatory knowledge
- deterministic `LegalReport` output for the frontend/agent

Working rule:
- Each phase is built independently.
- After each phase, implementation stops for approval.
- No next phase starts until approval is given.
- If Apify/x402/Swarm/OpenAI is not ready, use a mock adapter matching the final interface.

## Current Legal Scraping State

Current files:
- `scrapers/esma-watchdog/src/main.js`
- `merge.js`
- `knowledge_base.json`
- `upload-brain.js`
- `lib-verified-fetch/src/index.js`

Current flow:
1. `scrapers/esma-watchdog/src/main.js` uses Crawlee `CheerioCrawler`.
2. It visits the ESMA crypto-assets news URL.
3. It scans links on the page.
4. It filters titles using crypto/MiCA keywords.
5. It writes matching regulatory records to Crawlee's local dataset storage.
6. `merge.js` combines Solodit, Immunefi, and ESMA datasets into `knowledge_base.json`.
7. `upload-brain.js` uploads `knowledge_base.json` to Swarm.
8. `lib-verified-fetch/src/index.js` can fetch that Swarm hash back and parse it as JSON.

Current limitations:
- The scraper is not wrapped as a TypeScript module.
- There is no `LegalAnalyzer` class yet.
- There is no LLM call yet.
- There is no user-code summarizer yet.
- There is no deterministic `LegalReport` output yet.
- There is no x402 payment flow yet.
- The Swarm upload/fetch flow is script-level, not part of audit execution.
- The frontend cannot call this directly yet.

## Target Legal Analyzer Flow

```text
AuditInput
  |
  v
Code Intent Summarizer
  - read selected Solidity source
  - extract protocol type, user-facing claims, admin powers, assets, risk signals
  |
  v
Legal Knowledge Fetch
  - run ESMA/MiCA scraper or read cached dataset
  - merge relevant knowledge records
  - optionally fetch verified knowledge base from Swarm
  |
  v
Intent Collision Analyzer
  - compare code intent/admin behavior against MiCA/regulatory records
  - detect mismatch between comments/README-style claims and code behavior
  |
  v
LegalReport
```

## Phase 0: Protocol and Boundaries

Purpose:
- Lock the implementation sequence and clarify how existing scraper scripts become a callable analyzer.

Deliverables:
- This protocol document.
- Clear explanation of current legal scraping flow.
- Phase gates and acceptance criteria.

Approval gate:
- Stop after the plan is accepted.

Status:
- Complete.

## Phase 1: Shared Legal Analyzer Types and Mock

Purpose:
- Create the stable TypeScript interface before touching live scrapers or LLMs.

Files expected:
- `agent/src/tools/legal/LegalAnalyzer.ts`
- `agent/src/tools/legal/MockLegalAnalyzer.ts`
- optional updates to `agent/src/interfaces.ts`

Implementation tasks:
- Define `LegalAnalyzer`.
- Reuse or extend `AuditInput`, `AuditLogEvent`, `LegalReport`.
- Implement `MockLegalAnalyzer`.
- Emit realistic legal phases:
  - code intent summary
  - MiCA scrape
  - Swarm fetch
  - legal comparison
- Return deterministic `LegalReport`.

Mocked dependencies:
- OpenAI mocked.
- Apify/x402 mocked.
- Swarm mocked or read from local `knowledge_base.json`.

Acceptance criteria:
- TypeScript compiles.
- Mock analyzer produces valid `LegalReport`.
- Analyzer can be called by a future orchestrator.

Approval gate:
- Stop after mock analyzer compiles.

Status:
- Complete.

## Phase 2: User Code Intent Summarizer

Purpose:
- Extract a structured intent profile from the selected Solidity source.

Files expected:
- `agent/src/tools/legal/codeIntentSummarizer.ts`
- tests or fixtures under `agent/src/tools/legal/__fixtures__/`

Implementation tasks:
- Parse source text heuristically first.
- Extract:
  - contract names
  - public/external functions
  - owner/admin patterns
  - asset custody behavior
  - upgradeability hints
  - comments claiming decentralization/no-admin/no-custody
- Return `CodeIntentSummary`.

Mocked dependencies:
- No LLM required in this phase.

Acceptance criteria:
- Detects `onlyOwner`.
- Detects upgrade/admin function names.
- Detects comments claiming no admin.
- Produces compact JSON safe to send to an LLM.

Approval gate:
- Stop after local summarizer works on demo contracts.

Status:
- Complete.

## Phase 3: Legal Knowledge Provider

Purpose:
- Wrap current ESMA/MiCA scraper and knowledge-base data as a callable provider.

Files expected:
- `agent/src/tools/legal/legalKnowledgeProvider.ts`
- optional `agent/src/tools/legal/knowledgeBaseReader.ts`

Implementation tasks:
- Read local `knowledge_base.json`.
- Filter legal/regulatory records.
- Normalize ESMA/MiCA records into a compact schema.
- Add a function to refresh data by running the existing scraper script if needed.
- Keep cached mode as default for demo stability.

Mocked dependencies:
- Apify/x402 still mocked.
- Swarm fetch optional.

Acceptance criteria:
- Provider returns relevant MiCA/ESMA records.
- Provider handles missing `knowledge_base.json` gracefully.
- Output is token-budgeted for the LLM.

Approval gate:
- Stop after provider returns normalized legal knowledge.

Status:
- Complete.

## Phase 4: Swarm Verified Knowledge Fetch

Purpose:
- Make Swarm-backed legal knowledge usable during audit execution.

Files expected:
- `agent/src/tools/legal/swarmKnowledgeProvider.ts`
- small wrapper around `lib-verified-fetch/src/index.js` or migrated TypeScript equivalent

Implementation tasks:
- Accept `LEGAL_KNOWLEDGE_SWARM_HASH`.
- Fetch and verify data using `verifiedFetch`.
- Fall back to local `knowledge_base.json` if Swarm fetch fails.
- Emit clear audit logs for verified fetch.

Mocked dependencies:
- Full BMT verification remains demo-level unless already implemented.

Acceptance criteria:
- Swarm fetch path is callable.
- Local fallback works.
- Data shape matches Phase 3 provider output.

Approval gate:
- Stop after verified fetch/fallback works.

Status:
- Complete.

## Phase 5: LLM Legal Collision Analyzer

Purpose:
- Compare code intent against legal knowledge and produce the real `LegalReport`.

Files expected:
- `agent/src/tools/legal/legalCollisionAnalyzer.ts`
- `agent/src/tools/legal/prompts.ts`

Implementation tasks:
- Call OpenAI with structured JSON output.
- Inputs:
  - `CodeIntentSummary`
  - normalized MiCA/ESMA records
  - source snippets/comments
- Output:
  - legal risk level
  - score
  - intent summary
  - code intent mismatches
  - regulatory findings
  - sentiment summary
- Validate/retry malformed JSON.

Mocked dependencies:
- If `OPENAI_API_KEY` missing, fallback to deterministic local mock.

Acceptance criteria:
- Produces valid `LegalReport`.
- Does not include long raw legal documents in the prompt.
- Handles missing OpenAI key.

Approval gate:
- Stop after LLM/mocked collision analyzer works.

Status:
- Complete.

## Phase 6: Apify/x402 Integration Adapter

Purpose:
- Replace direct local scraper execution with the sponsor-facing paid scrape path.

Files expected:
- `agent/src/tools/legal/apifyX402LegalProvider.ts`

Implementation tasks:
- Wrap Apify actor call.
- Add x402 payment placeholder or real payment integration.
- Support `APIFY_PROVIDER_MODE=mcp-x402`, where the agent calls the Apify MCP `call-actor` tool through `mcpc` and `mcpc` signs/retries x402 payment without an Apify API token.
- Support `APIFY_MCP_DRY_RUN=true` for no-spend demos that verify the MCP session with a free docs call and then fall back to cached legal knowledge.
- Return Apify run ID.
- Return x402 payment tx hash when available.
- Normalize Apify output into legal knowledge records.

Mocked dependencies:
- If x402 is blocked, emit mock payment tx while preserving interface.

Acceptance criteria:
- Legal report contains `apifyRunId`.
- Legal report contains `x402PaymentTxHash` when available or mock value.
- Failure falls back to cached legal knowledge.

Approval gate:
- Stop after Apify adapter works or has clear fallback.

Status:
- Complete.

## Phase 7: Orchestrator Integration

Purpose:
- Make the legal analyzer callable by the local agent and frontend live bridge.

Files expected:
- `agent/src/index.ts`
- updates to local agent protocol if needed

Implementation tasks:
- Wire `LegalAnalyzer.run(input, emit)`.
- Stream legal logs to frontend.
- Combine with mock `SecurityReport` if Backend 2 is not ready.
- Return full `AuditResult`.

Mocked dependencies:
- Backend 2 can remain mocked.
- Backend 3 certification stays separate.

Acceptance criteria:
- Frontend can set `PREFLIGHT_AGENT_MODE=live`.
- Extension receives real-ish legal analyzer logs.
- Extension receives full `AuditResult`.
- Mock fallback remains available.

Approval gate:
- Stop after frontend can consume legal analyzer through the agent bridge.

Status:
- Complete.

## Phase 8: Demo Readiness and Smoke Harness

Purpose:
- Make the live legal analyzer path easy for the team to verify before the demo.

Files expected:
- `agent/src/auditOrchestrator.ts`
- `agent/src/scripts/agentSmoke.ts`
- updates to `package.json`

Implementation tasks:
- Extract audit orchestration from the stdin/stdout protocol entrypoint.
- Add a smoke script that runs the legal analyzer, fallback Apify/x402 metadata, and mock security composition.
- Validate required audit log phases.
- Validate the final `LegalReport` includes `apifyRunId` and `x402PaymentTxHash`.

Acceptance criteria:
- `npm run agent:smoke` passes.
- `npm run agent:typecheck` passes.
- Extension compile remains green.

Approval gate:
- Stop after smoke harness works.

Status:
- Complete.

## Approval Format

After each phase, respond with one of:
- `Approved: continue to Phase N`
- `Request changes: ...`
- `Pause`

No future phase starts until approval is received.
