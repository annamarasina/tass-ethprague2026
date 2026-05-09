import { createInterface } from "node:readline";
import type { AuditInput, AuditLogEvent, AuditResult } from "../types";
import { MockAuditClient } from "./mockAuditClient";
import type { AgentProcessManager } from "./processManager";

type EmitAuditLog = (event: AuditLogEvent) => void;

type AgentResponse =
  | { type: "log"; event: AuditLogEvent }
  | { type: "result"; auditResult: AuditResult }
  | { type: "error"; message: string };

export class AgentClient {
  private readonly mockAuditClient = new MockAuditClient();

  constructor(private readonly processManager: AgentProcessManager) {}

  async runAudit(input: AuditInput, emit: EmitAuditLog): Promise<AuditResult> {
    if (process.env.PREFLIGHT_AGENT_MODE !== "live") {
      emit(this.localFallbackLog(input.auditId, "Using mock audit client. Set PREFLIGHT_AGENT_MODE=live to attempt local agent mode."));
      return this.mockAuditClient.runAudit(input, emit);
    }

    if (!this.processManager.isAvailable()) {
      emit(this.localFallbackLog(input.auditId, "Local agent entrypoint unavailable; falling back to mock audit client."));
      return this.mockAuditClient.runAudit(input, emit);
    }

    try {
      return await this.runLiveAgent(input, emit);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown local agent error";
      emit(this.localFallbackLog(input.auditId, `Local agent failed: ${message}. Falling back to mock audit client.`));
      return this.mockAuditClient.runAudit(input, emit);
    }
  }

  private async runLiveAgent(input: AuditInput, emit: EmitAuditLog): Promise<AuditResult> {
    const child = this.processManager.start();

    return new Promise<AuditResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out waiting for local agent audit result"));
      }, 120_000);

      const lineReader = createInterface({ input: child.stdout });

      const cleanup = (): void => {
        clearTimeout(timeout);
        lineReader.close();
      };

      lineReader.on("line", (line) => {
        if (!line.trim()) {
          return;
        }

        const response = parseAgentResponse(line);

        if (response.type === "log") {
          emit(response.event);
          return;
        }

        if (response.type === "error") {
          cleanup();
          reject(new Error(response.message));
          return;
        }

        cleanup();
        resolve(response.auditResult);
      });

      child.stdin.write(`${JSON.stringify({ type: "runAudit", input })}\n`);
    });
  }

  private localFallbackLog(auditId: string, message: string): AuditLogEvent {
    return {
      auditId,
      timestamp: new Date().toISOString(),
      phase: "init",
      level: "warn",
      message,
    };
  }
}

function parseAgentResponse(line: string): AgentResponse {
  const parsed = JSON.parse(line) as AgentResponse;

  if (parsed.type !== "log" && parsed.type !== "result" && parsed.type !== "error") {
    throw new Error(`Unknown agent response type: ${(parsed as { type?: string }).type ?? "missing"}`);
  }

  return parsed;
}

