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
    if (this.processManager.getEnvironmentValue("PREFLIGHT_AGENT_MODE") !== "live") {
      return this.mockAuditClient.runAudit(input, emit);
    }

    emit(this.localFallbackLog(input.auditId, "[AGENT] Live agent mode enabled. Checking process manager availability..."));
    if (!this.processManager.isAvailable()) {
      const msg = "[ERROR] Local agent entrypoint unavailable; using bundled audit engine.";
      emit(this.localFallbackLog(input.auditId, msg));
      emit(this.localFallbackLog(input.auditId, "[AGENT] Initializing bundled audit engine..."));
      return this.mockAuditClient.runAudit(input, emit);
    }

    try {
      emit(this.localFallbackLog(input.auditId, "[AGENT] ✓ Process manager available. Starting live agent..."));
      return await this.runLiveAgent(input, emit);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown local agent error";
      const stack = error instanceof Error ? error.stack : "no stack trace";
      const msg = `[ERROR] Local agent failed: ${message}. Stack: ${stack}. Using bundled audit engine.`;
      emit(this.localFallbackLog(input.auditId, msg));
      emit(this.localFallbackLog(input.auditId, "[AGENT] Initializing bundled audit engine..."));
      return this.mockAuditClient.runAudit(input, emit);
    }
  }

  private async runLiveAgent(input: AuditInput, emit: EmitAuditLog): Promise<AuditResult> {
    emit(this.localFallbackLog(input.auditId, "[LIVE] Spawning agent process..."));
    const child = this.processManager.start();
    emit(this.localFallbackLog(input.auditId, `[LIVE] ✓ Agent process spawned (PID: ${child.pid})`));

    return new Promise<AuditResult>((resolve, reject) => {
      emit(this.localFallbackLog(input.auditId, "[LIVE] Setting 120s timeout for audit result..."));
      const timeout = setTimeout(() => {
        cleanup();
        const error = "[ERROR] Timed out waiting for local agent audit result (120s)";
        emit(this.localFallbackLog(input.auditId, error));
        reject(new Error(error));
      }, 120_000);

      emit(this.localFallbackLog(input.auditId, "[LIVE] Creating readline interface for stdout..."));
      const lineReader = createInterface({ input: child.stdout });

      const cleanup = (): void => {
        clearTimeout(timeout);
        lineReader.close();
        emit(this.localFallbackLog(input.auditId, "[LIVE] Cleaned up process resources"));
      };

      lineReader.on("line", (line) => {
        if (!line.trim()) {
          return;
        }

        try {
          const response = parseAgentResponse(line);

          if (response.type === "log") {
            emit(response.event);
            return;
          }

          if (response.type === "error") {
            cleanup();
            const error = `[ERROR] Agent returned error: ${response.message}`;
            emit(this.localFallbackLog(input.auditId, error));
            reject(new Error(response.message));
            return;
          }

          emit(this.localFallbackLog(input.auditId, "[LIVE] ✓ Received audit result from agent"));
          cleanup();
          resolve(response.auditResult);
        } catch (parseError) {
          const message = parseError instanceof Error ? parseError.message : "Unknown parse error";
          emit(this.localFallbackLog(input.auditId, `[ERROR] Failed to parse agent response: ${message}`));
          emit(this.localFallbackLog(input.auditId, `[DEBUG] Raw line: ${line.substring(0, 200)}`));
        }
      });

      lineReader.on("error", (error) => {
        const message = error instanceof Error ? error.message : String(error);
        emit(this.localFallbackLog(input.auditId, `[ERROR] Readline error: ${message}`));
        cleanup();
        reject(error);
      });

      emit(this.localFallbackLog(input.auditId, "[LIVE] Sending audit input to agent process..."));
      child.stdin.write(`${JSON.stringify({ type: "runAudit", input })}\n`);
      emit(this.localFallbackLog(input.auditId, "[LIVE] ✓ Input sent, waiting for response..."));
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
