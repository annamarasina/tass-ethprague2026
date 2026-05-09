import type { ExtensionToWebviewMessage, WebviewModel, WebviewToExtensionMessage } from "./types";

declare const acquireVsCodeApi: () => {
  postMessage(message: WebviewToExtensionMessage): void;
};

declare global {
  interface Window {
    __PRE_FLIGHT_MODEL__?: WebviewModel;
  }
}

const vscode = acquireVsCodeApi();
let model: WebviewModel = window.__PRE_FLIGHT_MODEL__ ?? {
  state: "idle",
  logs: [],
};

const runButton = document.querySelector<HTMLButtonElement>("#runAudit");
const statusMessage = document.querySelector<HTMLElement>("#statusMessage");
const statePill = document.querySelector<HTMLElement>("#statePill");
const selectedFile = document.querySelector<HTMLElement>("#selectedFile");
const logs = document.querySelector<HTMLElement>("#logs");
const logCount = document.querySelector<HTMLElement>("#logCount");

runButton?.addEventListener("click", () => {
  vscode.postMessage({ type: "runAudit" });
});

window.addEventListener("message", (event: MessageEvent<ExtensionToWebviewMessage>) => {
  const message = event.data;

  if (message.type === "replaceState") {
    model = message.model;
    render();
    return;
  }

  if (message.type === "appendLog") {
    model = {
      ...model,
      state: message.state ?? model.state,
      statusMessage: message.statusMessage ?? model.statusMessage,
      logs: [...model.logs, message.log],
    };
    render();
  }
});

render();

function render(): void {
  if (runButton) {
    runButton.disabled = model.state === "running";
  }

  if (statusMessage) {
    statusMessage.textContent = model.statusMessage ?? defaultStatus(model);
  }

  if (statePill) {
    statePill.textContent = model.state;
  }

  if (selectedFile) {
    selectedFile.textContent = model.selectedFilePath ?? "No active Solidity file selected.";
  }

  if (logCount) {
    logCount.textContent = String(model.logs.length);
  }

  if (!logs) {
    return;
  }

  if (model.logs.length === 0) {
    logs.innerHTML = `<div class="empty">Run an audit to stream activity here.</div>`;
    return;
  }

  logs.replaceChildren(...model.logs.map(renderLog));
  logs.scrollTop = logs.scrollHeight;
}

function renderLog(log: WebviewModel["logs"][number]): HTMLElement {
  const row = document.createElement("div");
  row.className = `log ${log.level}`;

  const meta = document.createElement("div");
  meta.className = "log-meta";
  meta.textContent = `${timeOnly(log.timestamp)} ${log.phase}`;

  const message = document.createElement("div");
  message.className = "log-message";
  message.textContent = log.message;

  row.append(meta, message);
  return row;
}

function defaultStatus(current: WebviewModel): string {
  if (current.state === "running") {
    return "Audit running";
  }

  if (current.state === "error") {
    return "Audit failed";
  }

  return "Ready";
}

function timeOnly(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "--:--:--";
  }

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

