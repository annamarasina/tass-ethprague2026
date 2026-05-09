import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as vscode from "vscode";

export interface AgentProcessManagerOptions {
  workspaceRoot: string;
  outputChannel: vscode.OutputChannel;
}

export class AgentProcessManager implements vscode.Disposable {
  private process?: ChildProcessWithoutNullStreams;

  constructor(private readonly options: AgentProcessManagerOptions) {}

  isAvailable(): boolean {
    return existsSync(this.agentEntrypoint);
  }

  start(): ChildProcessWithoutNullStreams {
    this.options.outputChannel.appendLine(`[PROCESS] Checking if process is already running...`);
    if (this.process && !this.process.killed) {
      this.options.outputChannel.appendLine(`[PROCESS] ✓ Reusing existing process (PID: ${this.process.pid})`);
      return this.process;
    }

    this.options.outputChannel.appendLine(`[PROCESS] Checking agent entrypoint availability...`);
    if (!this.isAvailable()) {
      const error = `Agent entrypoint not found: ${this.agentEntrypoint}`;
      this.options.outputChannel.appendLine(`[ERROR] ${error}`);
      throw new Error(error);
    }

    this.options.outputChannel.appendLine(`[PROCESS] ✓ Agent entrypoint found at: ${this.agentEntrypoint}`);
    this.options.outputChannel.appendLine(`[PROCESS] Spawning Node process with entrypoint...`);
    this.options.outputChannel.appendLine(`[PROCESS] Working directory: ${this.options.workspaceRoot}`);

    this.process = spawn("node", [this.agentEntrypoint], {
      cwd: this.options.workspaceRoot,
      env: process.env,
      stdio: "pipe",
    });

    this.options.outputChannel.appendLine(`[PROCESS] ✓ Process spawned (PID: ${this.process.pid})`);

    this.process.stderr.on("data", (chunk: Buffer) => {
      this.options.outputChannel.appendLine(`[AGENT STDERR] ${chunk.toString("utf8").trimEnd()}`);
    });

    this.process.on("error", (error) => {
      this.options.outputChannel.appendLine(`[ERROR] Process error: ${error.message}`);
    });

    this.process.on("exit", (code, signal) => {
      this.options.outputChannel.appendLine(`[PROCESS] Process exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
      this.process = undefined;
    });

    return this.process;
  }

  dispose(): void {
    if (this.process && !this.process.killed) {
      this.process.kill();
    }
  }

  private get agentEntrypoint(): string {
    return resolve(this.options.workspaceRoot, "agent", "dist", "index.js");
  }
}

