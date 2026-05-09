import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AuditInput } from "../interfaces";

loadDotEnv(resolve(process.cwd(), ".env"));
const { runAudit } = await import("../auditOrchestrator");

const selectedFilePath = resolve(
  process.cwd(),
  process.argv[2] ?? "agent/src/tools/legal/__fixtures__/NoAdminClaimVault.sol",
);

if (!existsSync(selectedFilePath)) {
  throw new Error(`Solidity file not found: ${selectedFilePath}`);
}

const sourceCode = readFileSync(selectedFilePath, "utf8");
const input: AuditInput = {
  auditId: `legal-debug-${Date.now()}`,
  selectedFilePath,
  sourceCode,
  chainId: 84532,
  timestamp: new Date().toISOString(),
};

const logs: Array<{ phase: string; level: string; message: string; data?: Record<string, unknown> }> = [];
const result = await runAudit(input, (event) => {
  if (event.phase.startsWith("legal") || event.phase === "swarm_fetch") {
    logs.push({
      phase: event.phase,
      level: event.level,
      message: event.message,
      data: event.data,
    });
  }
});

console.log(JSON.stringify(
  {
    auditId: result.auditId,
    selectedFilePath: result.selectedFilePath,
    legalLogs: logs,
    legalReport: result.legalReport,
  },
  null,
  2,
));

function loadDotEnv(path: string): void {
  if (!existsSync(path)) {
    return;
  }

  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripQuotes(trimmed.slice(separatorIndex + 1).trim());
    process.env[key] ??= value;
  }
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
