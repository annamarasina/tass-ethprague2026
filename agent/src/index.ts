import { createInterface } from "node:readline";
import { runAudit } from "./auditOrchestrator";
import type { AuditInput, AuditLogEvent, AuditResult } from "./interfaces";

type AgentRequest = { type: "runAudit"; input: AuditInput };
type AgentResponse =
  | { type: "log"; event: AuditLogEvent }
  | { type: "result"; auditResult: AuditResult }
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

    if (request.type !== "runAudit") {
      throw new Error(`Unsupported agent request type: ${request.type}`);
    }

    const auditResult = await runAudit(request.input, (event) => {
      writeResponse({ type: "log", event });
    });

    writeResponse({ type: "result", auditResult });
  } catch (error) {
    writeResponse({
      type: "error",
      message: error instanceof Error ? error.message : "Unknown agent error",
    });
  }
}

function parseRequest(line: string): AgentRequest {
  const parsed = JSON.parse(line) as Partial<AgentRequest>;

  if (parsed.type !== "runAudit" || !parsed.input) {
    throw new Error("Agent request must be { type: 'runAudit', input }");
  }

  return parsed as AgentRequest;
}

function writeResponse(response: AgentResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}
