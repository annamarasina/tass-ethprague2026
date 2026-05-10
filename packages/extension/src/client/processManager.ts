import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
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
    return existsSync(this.agentEntrypoint) || existsSync(this.agentSourceEntrypoint);
  }

  getEnvironmentValue(name: string): string | undefined {
    return this.getEnvironment()[name];
  }

  start(): ChildProcessWithoutNullStreams {
    if (this.process && !this.process.killed) {
      return this.process;
    }

    const command = this.getStartCommand();

    this.process = spawn(command.executable, command.args, {
      cwd: this.options.workspaceRoot,
      env: this.getEnvironment(),
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
    return resolve(this.options.workspaceRoot, "packages", "agent", "dist", "index.js");
  }

  private get agentSourceEntrypoint(): string {
    return resolve(this.options.workspaceRoot, "packages", "agent", "src", "index.ts");
  }

  private getStartCommand(): { executable: string; args: string[] } {
    if (existsSync(this.agentEntrypoint)) {
      return { executable: "node", args: [this.agentEntrypoint] };
    }

    if (existsSync(this.agentSourceEntrypoint)) {
      return { executable: "npx", args: ["tsx", this.agentSourceEntrypoint] };
    }

    throw new Error(`Agent entrypoint not found: ${this.agentEntrypoint}`);
  }

  private getEnvironment(): NodeJS.ProcessEnv {
    return {
      ...process.env,
      ...loadDotEnv(resolve(this.options.workspaceRoot, ".env")),
    };
  }
}

function loadDotEnv(path: string): NodeJS.ProcessEnv {
  if (!existsSync(path)) {
    return {};
  }

  const env: NodeJS.ProcessEnv = {};
  const lines = readFileSync(path, "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    env[key] = unquote(rawValue);
  }

  return env;
}

function unquote(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  return value;
}
