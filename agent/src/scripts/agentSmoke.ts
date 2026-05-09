import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runAudit } from "../auditOrchestrator";
import type { AuditInput } from "../interfaces";

const fixturePath = resolve(process.cwd(), "agent", "src", "tools", "legal", "__fixtures__", "NoAdminClaimVault.sol");
const sourceCode = readFileSync(fixturePath, "utf8");

const input: AuditInput = {
  auditId: `agent-smoke-${Date.now()}`,
  selectedFilePath: fixturePath,
  sourceCode,
  chainId: 84532,
  timestamp: new Date().toISOString(),
};

const logs: Array<{ phase: string; level: string; message: string }> = [];
const result = await runAudit(input, (event) => {
  logs.push({
    phase: event.phase,
    level: event.level,
    message: event.message,
  });
});

const requiredPhases = ["init", "legal_payment", "legal_scrape", "legal_analysis", "security_parse", "security_analysis", "report"];
const missingPhases = requiredPhases.filter((phase) => !logs.some((log) => log.phase === phase));

if (missingPhases.length > 0) {
  throw new Error(`Agent smoke test missing phase(s): ${missingPhases.join(", ")}`);
}

if (!result.legalReport.apifyRunId || !result.legalReport.x402PaymentTxHash) {
  throw new Error("Agent smoke test expected Apify run ID and x402 payment hash in LegalReport");
}

console.log(JSON.stringify(
  {
    auditId: result.auditId,
    totalScore: result.totalScore,
    certificationEligible: result.certificationEligible,
    legalRisk: result.legalReport.riskLevel,
    securityFindings: result.securityReport.findings.length,
    apifyRunId: result.legalReport.apifyRunId,
    x402PaymentTxHash: result.legalReport.x402PaymentTxHash,
    phases: logs.map((log) => log.phase),
  },
  null,
  2,
));
