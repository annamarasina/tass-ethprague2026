import { createInterface } from "node:readline";
import { runAudit } from "./auditOrchestrator";
import type { AuditInput, AuditLogEvent, AuditResult, CertificateResult } from "./interfaces";
import { RegistryCertificationService } from "./tools/certification";

type AgentRequest =
  | { type: "runAudit"; input: AuditInput }
  | { type: "issueCertificate"; auditResult: AuditResult };
type AgentResponse =
  | { type: "log"; event: AuditLogEvent }
  | { type: "result"; auditResult: AuditResult }
  | { type: "certificate"; certificateResult: CertificateResult }
  | { type: "error"; message: string };

const lineReader = createInterface({
  input: process.stdin,
  crlfDelay: Number.POSITIVE_INFINITY,
});

lineReader.on("line", (line) => {
  void handleLine(line);
});

async function handleLine(line: string): Promise<void> {
  if (!line.trim()) {
    return;
  }

  try {
    const request = parseRequest(line);

    if (request.type === "runAudit") {
      const auditResult = await runAudit(request.input, (event) => {
        writeResponse({ type: "log", event });
      });

      writeResponse({ type: "result", auditResult });
      return;
    }

    if (request.type === "issueCertificate") {
      const service = new RegistryCertificationService();
      const certificateResult = await service.issueCertificate(request.auditResult, (event) => {
        writeResponse({ type: "log", event });
      });

      writeResponse({ type: "certificate", certificateResult });
      return;
    }

    throw new Error(`Unsupported agent request type: ${(request as { type?: string }).type ?? "missing"}`);
  } catch (error) {
    writeResponse({
      type: "error",
      message: error instanceof Error ? error.message : "Unknown agent error",
    });
  }
}

function parseRequest(line: string): AgentRequest {
  const parsed = JSON.parse(line) as Partial<AgentRequest>;

  if (parsed.type === "runAudit" && parsed.input) {
    return parsed as AgentRequest;
  }

  if (parsed.type === "issueCertificate" && (parsed as Partial<{ auditResult: AuditResult }>).auditResult) {
    return parsed as AgentRequest;
  }

  throw new Error("Agent request must be { type: 'runAudit', input } or { type: 'issueCertificate', auditResult }");
}

function writeResponse(response: AgentResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}
