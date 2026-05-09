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
    if (this.process && !this.process.killed) {
      return this.process;
    }

    if (!this.isAvailable()) {
      throw new Error(`Agent entrypoint not found: ${this.agentEntrypoint}`);
    }

    this.process = spawn("node", [this.agentEntrypoint], {
      cwd: this.options.workspaceRoot,
      env: process.env,
      stdio: "pipe",
    });

    this.process.stderr.on("data", (chunk: Buffer) => {
      this.options.outputChannel.appendLine(`[agent stderr] ${chunk.toString("utf8").trimEnd()}`);
    });

    this.process.on("exit", (code, signal) => {
      this.options.outputChannel.appendLine(`[agent] exited code=${code ?? "null"} signal=${signal ?? "null"}`);
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

