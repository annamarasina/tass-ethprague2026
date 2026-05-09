import type { AuditResult } from "../types";

export type WebviewState = "idle" | "running" | "report" | "blocked" | "certified" | "error";

export interface WebviewLog {
  timestamp: string;
  level: "info" | "warn" | "error" | "success";
  phase: string;
  message: string;
}

export interface WebviewModel {
  state: WebviewState;
  selectedFilePath?: string;
  logs: WebviewLog[];
  statusMessage?: string;
  auditResult?: AuditResult;
}

export type WebviewToExtensionMessage = { type: "runAudit" };

export type ExtensionToWebviewMessage =
  | { type: "replaceState"; model: WebviewModel }
  | { type: "appendLog"; log: WebviewLog; state?: WebviewState; statusMessage?: string };
