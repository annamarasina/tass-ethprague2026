import * as vscode from "vscode";
import { EXTENSION_NAME } from "../constants";
import type { WebviewModel } from "./types";

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, initialModel: WebviewModel): string {
  const nonce = getNonce();
  const modelJson = JSON.stringify(initialModel).replace(/</g, "\\u003c");
  const cspSource = webview.cspSource;
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "webview.js"));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${EXTENSION_NAME}</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: dark;
      --pf-accent: #0a84ff;
      --pf-accent-light: #5ac8fa;
      --pf-accent-soft: rgba(10, 132, 255, 0.12);
      --pf-accent-glow: rgba(10, 132, 255, 0.08);
      --pf-success: #30d158;
      --pf-success-soft: rgba(48, 209, 88, 0.1);
      --pf-warning: #ffd60a;
      --pf-warning-soft: rgba(255, 214, 10, 0.1);
      --pf-danger: #ff453a;
      --pf-danger-soft: rgba(255, 69, 58, 0.1);
      --pf-surface: rgba(255, 255, 255, 0.04);
      --pf-surface-elevated: rgba(255, 255, 255, 0.06);
      --pf-surface-hover: rgba(255, 255, 255, 0.08);
      --pf-border: rgba(255, 255, 255, 0.06);
      --pf-border-hover: rgba(255, 255, 255, 0.12);
      --pf-separator: rgba(255, 255, 255, 0.04);
      --pf-text-primary: rgba(255, 255, 255, 0.92);
      --pf-text-secondary: rgba(255, 255, 255, 0.55);
      --pf-text-tertiary: rgba(255, 255, 255, 0.35);
      --pf-radius: 12px;
      --pf-radius-sm: 8px;
      --pf-radius-lg: 16px;
      --pf-radius-xl: 20px;
      --pf-shadow-sm: 0 1px 2px rgba(0,0,0,0.3), 0 1px 3px rgba(0,0,0,0.15);
      --pf-shadow-md: 0 4px 12px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.2);
      --pf-shadow-lg: 0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.2);
      --pf-font: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", var(--vscode-font-family), system-ui, sans-serif;
      --pf-mono: "SF Mono", "Fira Code", var(--vscode-editor-font-family), ui-monospace, monospace;
    }

    * {
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    body {
      margin: 0;
      padding: 0;
      font-family: var(--pf-font);
      color: var(--pf-text-primary);
      background: var(--vscode-sideBar-background);
      overflow-x: hidden;
      line-height: 1.47;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes fadeScale {
      from { opacity: 0; transform: scale(0.97); }
      to { opacity: 1; transform: scale(1); }
    }

    @keyframes breathe {
      0%, 100% { opacity: 0.7; }
      50% { opacity: 1; }
    }

    @keyframes shimmer {
      0% { background-position: -200% 0; }
      100% { background-position: 200% 0; }
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .app {
      display: flex;
      height: 100vh;
      flex-direction: column;
      padding: 16px 16px 0;
      overflow: hidden;
    }

    /* ─── HEADER ─── */
    .header {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 12px;
      animation: fadeIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    .header-top {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(145deg, #0a84ff, #5856d6);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: var(--pf-shadow-md), 0 0 0 0.5px rgba(255,255,255,0.1) inset;
    }

    .logo svg {
      width: 19px;
      height: 19px;
      filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
    }

    .title {
      min-width: 0;
    }

    h1 {
      margin: 0;
      font-size: 16px;
      line-height: 1.2;
      font-weight: 700;
      letter-spacing: -0.4px;
      color: var(--pf-text-primary);
    }

    .subtitle {
      margin-top: 2px;
      color: var(--pf-text-secondary);
      font-size: 12px;
      line-height: 1.3;
      font-weight: 400;
      letter-spacing: -0.1px;
    }

    .actions {
      display: flex;
      gap: 8px;
    }

    button {
      position: relative;
      border: none;
      border-radius: var(--pf-radius-sm);
      padding: 10px 18px;
      color: #fff;
      background: var(--pf-accent);
      font-family: var(--pf-font);
      font-size: 13px;
      font-weight: 600;
      letter-spacing: -0.1px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      box-shadow: var(--pf-shadow-sm);
      outline: none;
    }

    button:hover {
      filter: brightness(1.1);
      box-shadow: var(--pf-shadow-md);
      transform: translateY(-0.5px);
    }

    button:active {
      filter: brightness(0.95);
      transform: translateY(0) scale(0.98);
      box-shadow: var(--pf-shadow-sm);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.4;
      transform: none;
      box-shadow: none;
      filter: none;
    }

    .btn-secondary {
      background: var(--pf-surface-elevated);
      border: 0.5px solid var(--pf-border-hover);
      color: var(--pf-text-primary);
      box-shadow: none;
    }

    .btn-secondary:hover {
      background: var(--pf-surface-hover);
      box-shadow: var(--pf-shadow-sm);
    }

    .btn-success {
      background: var(--pf-success);
      color: #000;
      font-weight: 700;
    }

    .btn-success:hover {
      box-shadow: 0 4px 16px var(--pf-success-soft), var(--pf-shadow-sm);
    }

    /* ─── STATUS CARD ─── */
    .status {
      border: 0.5px solid var(--pf-border);
      border-radius: var(--pf-radius);
      padding: 14px 16px;
      background: var(--pf-surface);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      transition: all 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      animation: fadeIn 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      box-shadow: var(--pf-shadow-sm);
    }

    .status.running {
      border-color: rgba(10, 132, 255, 0.3);
      box-shadow: var(--pf-shadow-sm), 0 0 0 1px rgba(10, 132, 255, 0.1);
    }

    .status-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .status-label {
      font-size: 14px;
      font-weight: 600;
      letter-spacing: -0.2px;
    }

    .pill {
      flex: 0 0 auto;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    .pill.idle {
      background: var(--pf-surface-elevated);
      color: var(--pf-text-tertiary);
    }

    .pill.running {
      background: var(--pf-accent-soft);
      color: var(--pf-accent);
    }

    .pill.report {
      background: var(--pf-success-soft);
      color: var(--pf-success);
    }

    .pill.error {
      background: var(--pf-danger-soft);
      color: var(--pf-danger);
    }

    .pill.blocked {
      background: var(--pf-warning-soft);
      color: var(--pf-warning);
    }

    .pill.certified {
      background: var(--pf-success-soft);
      color: var(--pf-success);
    }

    .file {
      margin-top: 10px;
      padding: 8px 10px;
      border-radius: var(--pf-radius-sm);
      background: rgba(0,0,0,0.2);
      color: var(--pf-text-secondary);
      font-family: var(--pf-mono);
      font-size: 11px;
      line-height: 1.4;
      word-break: break-all;
      letter-spacing: -0.2px;
    }

    /* ─── PROGRESS BAR ─── */
    .progress-bar {
      height: 3px;
      margin-top: 12px;
      border-radius: 3px;
      overflow: hidden;
      background: rgba(255,255,255,0.04);
      display: none;
    }

    .progress-bar.active {
      display: block;
    }

    .progress-bar-fill {
      height: 100%;
      width: 40%;
      border-radius: 3px;
      background: linear-gradient(90deg, var(--pf-accent), var(--pf-accent-light), var(--pf-accent));
      background-size: 200% 100%;
      animation: shimmer 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    /* ─── CODE INPUT ─── */
    .code-input-section {
      display: flex;
      height: 100%;
      flex-direction: column;
      gap: 8px;
    }

    .code-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--pf-text-tertiary);
      flex-shrink: 0;
    }

    .code-textarea {
      width: 100%;
      flex: 1;
      min-height: 0;
      resize: none;
      border: 0.5px solid var(--pf-border);
      border-radius: var(--pf-radius);
      padding: 14px 16px;
      background: rgba(0,0,0,0.2);
      color: var(--pf-text-primary);
      font-family: var(--pf-mono);
      font-size: 12px;
      line-height: 1.6;
      tab-size: 4;
      outline: none;
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
      box-shadow: var(--pf-shadow-sm);
    }

    .code-textarea::placeholder {
      color: var(--pf-text-tertiary);
    }

    .code-textarea:focus {
      border-color: rgba(10, 132, 255, 0.4);
      box-shadow: var(--pf-shadow-sm), 0 0 0 3px var(--pf-accent-glow);
    }

    .code-textarea:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* ─── LOG PANEL ─── */
    .log-panel {
      display: flex;
      flex-direction: column;
      border: 0.5px solid var(--pf-border);
      border-radius: var(--pf-radius);
      background: rgba(0,0,0,0.12);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow: var(--pf-shadow-sm);
    }

    .log-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-bottom: 0.5px solid var(--pf-separator);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--pf-text-tertiary);
    }

    .log-count {
      background: var(--pf-surface-elevated);
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 10px;
      font-weight: 700;
      min-width: 20px;
      text-align: center;
      color: var(--pf-text-secondary);
    }

    .log-section-label {
      padding: 10px 14px 6px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--pf-accent);
      border-bottom: 0.5px solid var(--pf-separator);
      flex-shrink: 0;
    }

    .log-carousel {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .logs {
      padding: 14px;
      min-height: 180px;
      font-family: var(--pf-mono);
      font-size: 11px;
      line-height: 1.6;
      display: flex;
      align-items: flex-start;
      justify-content: center;
    }

    .logs > * {
      width: 100%;
      animation: logFadeIn 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    @keyframes logFadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .log-nav {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 10px 14px;
      border-top: 0.5px solid var(--pf-separator);
      flex-shrink: 0;
    }

    .log-nav-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 6px 12px;
      border: 0.5px solid var(--pf-border);
      border-radius: 999px;
      background: var(--pf-surface);
      color: var(--pf-text-secondary);
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: none;
    }

    .log-nav-btn svg {
      width: 14px;
      height: 14px;
      flex-shrink: 0;
    }

    .log-nav-btn:hover:not(:disabled) {
      background: var(--pf-accent-soft);
      color: var(--pf-accent);
      border-color: var(--pf-accent);
      transform: none;
      box-shadow: none;
      filter: none;
    }

    .log-nav-btn:disabled {
      opacity: 0.3;
      cursor: default;
    }

    .log-index {
      font-size: 11px;
      font-weight: 600;
      color: var(--pf-text-tertiary);
      min-width: 50px;
      text-align: center;
      letter-spacing: 0.2px;
    }

    .log {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 10px;
      margin-bottom: 4px;
      padding: 5px 8px;
      border-radius: 6px;
      transition: background 0.15s ease;
      animation: fadeIn 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    .log:hover {
      background: var(--pf-surface);
    }

    .log-meta {
      color: var(--pf-text-tertiary);
      white-space: nowrap;
      font-size: 10px;
      letter-spacing: -0.2px;
    }

    .log-message {
      min-width: 0;
      font-family: var(--pf-mono);
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--pf-text-secondary);
    }

    .log.success .log-message {
      color: var(--pf-success);
    }

    .log.warn .log-message {
      color: var(--pf-warning);
    }

    .log.error .log-message {
      color: var(--pf-danger);
    }

    .log.info .log-message::before {
      content: '\\2022 ';
      color: var(--pf-accent);
      opacity: 0.6;
    }

    .log.success .log-message::before {
      content: '\\2713 ';
    }

    .log.warn .log-message::before {
      content: '\\26A0 ';
    }

    .log.error .log-message::before {
      content: '\\2717 ';
    }

    /* ─── SUMMARY / REPORT ─── */
    .summary {
      border: 0.5px solid var(--pf-border);
      border-radius: var(--pf-radius-lg);
      padding: 18px;
      background: var(--pf-surface);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      animation: fadeScale 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      box-shadow: var(--pf-shadow-md);
    }

    .summary.visible {
      display: block;
    }

    .summary-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .summary-title {
      min-width: 0;
    }

    .summary-title strong {
      display: block;
      font-size: 16px;
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: -0.4px;
    }

    .summary-subtitle {
      margin-top: 4px;
      color: var(--pf-text-secondary);
      font-size: 12px;
      line-height: 1.35;
      font-weight: 400;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-top: 16px;
    }

    .metric {
      min-width: 0;
      border: 0.5px solid var(--pf-border);
      border-radius: var(--pf-radius);
      padding: 14px 10px;
      background: rgba(0,0,0,0.15);
      text-align: center;
      transition: all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    .metric:hover {
      background: var(--pf-accent-glow);
      border-color: rgba(10, 132, 255, 0.2);
      transform: translateY(-1px);
      box-shadow: var(--pf-shadow-sm);
    }

    .metric-label {
      color: var(--pf-text-tertiary);
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      line-height: 1.2;
    }

    .metric-value {
      margin-top: 8px;
      font-size: 22px;
      font-weight: 800;
      line-height: 1;
      letter-spacing: -0.5px;
      color: var(--pf-text-primary);
    }

    .finding-preview {
      margin-top: 14px;
      padding: 10px 12px;
      border-radius: var(--pf-radius-sm);
      background: rgba(0,0,0,0.15);
      color: var(--pf-text-secondary);
      font-size: 12px;
      line-height: 1.45;
      font-weight: 400;
    }

    .action-button {
      flex: 0 0 auto;
      white-space: nowrap;
    }

    .action-button.hidden {
      display: none;
    }

    .blocked-note {
      display: none;
      margin-top: 14px;
      border-left: 3px solid var(--pf-danger);
      border-radius: 0 var(--pf-radius-sm) var(--pf-radius-sm) 0;
      padding: 12px 14px;
      background: var(--pf-danger-soft);
      color: var(--pf-danger);
      font-size: 12px;
      line-height: 1.5;
      font-weight: 500;
    }

    .blocked-note.visible {
      display: block;
    }

    /* ─── SECTIONS ─── */
    .section {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 0.5px solid var(--pf-separator);
    }

    .section-title {
      margin: 0 0 12px;
      color: var(--pf-text-secondary);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .section-title::before {
      content: '';
      width: 3px;
      height: 14px;
      border-radius: 2px;
      background: var(--pf-accent);
    }

    .summary-text {
      margin: 0;
      color: var(--pf-text-secondary);
      font-size: 13px;
      line-height: 1.6;
      font-weight: 400;
    }

    /* ─── LIST ITEMS ─── */
    .list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .item {
      border: 0.5px solid var(--pf-border);
      border-radius: var(--pf-radius);
      padding: 12px 14px;
      background: rgba(0,0,0,0.1);
      transition: all 0.25s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    .item.clickable {
      cursor: pointer;
    }

    .item.clickable:hover,
    .item.clickable:focus {
      border-color: rgba(10, 132, 255, 0.25);
      background: var(--pf-accent-glow);
      transform: translateX(3px);
      box-shadow: var(--pf-shadow-sm);
      outline: none;
    }

    .item-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 10px;
    }

    .item-title {
      min-width: 0;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: -0.1px;
    }

    .item-body {
      margin-top: 6px;
      color: var(--pf-text-secondary);
      font-size: 12px;
      line-height: 1.5;
    }

    .tag {
      flex: 0 0 auto;
      border-radius: 999px;
      padding: 3px 9px;
      font-size: 9px;
      font-weight: 700;
      line-height: 1.5;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      background: var(--pf-surface-elevated);
      color: var(--pf-text-secondary);
    }

    .tag.critical,
    .tag.high {
      background: var(--pf-danger-soft);
      color: var(--pf-danger);
    }

    .tag.medium {
      background: var(--pf-warning-soft);
      color: var(--pf-warning);
    }

    .tag.low,
    .tag.info {
      background: var(--pf-accent-soft);
      color: var(--pf-accent);
    }

    .meta-line {
      margin-top: 6px;
      color: var(--pf-text-tertiary);
      font-family: var(--pf-mono);
      font-size: 10px;
      line-height: 1.4;
      word-break: break-word;
    }

    /* ─── CERTIFIED PANEL ─── */
    .certified-panel {
      display: none;
      margin-top: 16px;
      border: 0.5px solid rgba(48, 209, 88, 0.3);
      border-radius: var(--pf-radius);
      padding: 14px 16px;
      background: var(--pf-success-soft);
      animation: fadeScale 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    .certified-panel.visible {
      display: block;
    }

    .certified-panel strong {
      color: var(--pf-success);
      font-size: 14px;
      letter-spacing: -0.2px;
    }

    .link-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }

    .text-link {
      border: 0;
      border-radius: 0;
      padding: 2px 0;
      color: var(--pf-accent);
      background: transparent;
      text-align: left;
      font-size: 12px;
      line-height: 1.35;
      cursor: pointer;
      word-break: break-all;
      text-decoration: none;
      transition: color 0.15s ease;
      box-shadow: none;
      font-weight: 500;
    }

    .text-link:hover {
      color: var(--pf-accent-light);
      background: transparent;
      transform: none;
      box-shadow: none;
      filter: none;
    }

    .empty {
      color: var(--pf-text-tertiary);
      font-size: 12px;
      font-style: normal;
      text-align: center;
      padding: 16px 0;
    }

    /* ─── TRACE CARDS ─── */
    .trace-card {
      grid-column: 1 / -1;
      border: 0.5px solid var(--pf-border);
      border-radius: var(--pf-radius);
      padding: 12px 14px;
      background: var(--pf-surface);
      animation: slideDown 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    .trace-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }

    .trace-title {
      min-width: 0;
      font-family: var(--pf-font);
      font-size: 13px;
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: -0.1px;
    }

    .trace-step {
      flex: 0 0 auto;
      border-radius: 999px;
      padding: 3px 10px;
      color: var(--pf-accent);
      background: var(--pf-accent-soft);
      font-size: 10px;
      font-weight: 700;
      line-height: 1.4;
      letter-spacing: 0.2px;
    }

    .trace-note {
      margin-bottom: 10px;
      color: var(--pf-text-secondary);
      font-size: 11px;
      line-height: 1.5;
      word-break: break-word;
    }

    .trace-table {
      display: grid;
      gap: 3px;
    }

    .trace-row {
      display: grid;
      grid-template-columns: 52px 50px 74px minmax(72px, 1fr);
      gap: 6px;
      align-items: center;
      font-family: var(--pf-mono);
      font-size: 11px;
      line-height: 1.4;
      color: var(--pf-text-secondary);
      padding: 2px 4px;
      border-radius: 4px;
      transition: background 0.15s ease;
    }

    .trace-row:hover {
      background: var(--pf-surface);
    }

    .trace-row.highlight {
      color: var(--pf-success);
      font-weight: 650;
      background: var(--pf-success-soft);
    }

    .trace-bar {
      color: var(--pf-accent);
      white-space: nowrap;
      overflow: hidden;
    }

    .trace-row.highlight .trace-bar {
      color: var(--pf-success);
    }

    .trace-kv {
      display: grid;
      grid-template-columns: 85px 1fr;
      gap: 5px 10px;
      font-family: var(--pf-mono);
      font-size: 11px;
      line-height: 1.5;
    }

    .trace-key {
      color: var(--pf-text-tertiary);
      font-weight: 500;
    }

    .trace-value {
      min-width: 0;
      word-break: break-word;
      color: var(--pf-text-secondary);
    }

    .trace-output {
      margin: 0;
      color: var(--pf-text-primary);
      font-family: var(--pf-font);
      font-size: 13px;
      line-height: 1.55;
      white-space: normal;
      font-weight: 400;
    }

    /* ─── PAYMENT ─── */
    .payment-panel {
      display: none;
      border: 0.5px solid var(--pf-border);
      border-radius: var(--pf-radius);
      padding: 16px;
      background: var(--pf-surface);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      box-shadow: var(--pf-shadow-md);
      animation: fadeScale 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    .payment-panel.visible {
      display: block;
    }

    .payment-header {
      margin-bottom: 12px;
    }

    .payment-title {
      font-size: 14px;
      font-weight: 700;
      line-height: 1.3;
      letter-spacing: -0.2px;
    }

    .payment-subtitle {
      margin-top: 4px;
      color: var(--pf-text-secondary);
      font-size: 12px;
      line-height: 1.4;
    }

    .payment-amount {
      display: inline-block;
      border-radius: var(--pf-radius-sm);
      padding: 8px 14px;
      font-family: var(--pf-mono);
      font-size: 15px;
      font-weight: 700;
      background: var(--pf-accent-soft);
      color: var(--pf-accent);
      letter-spacing: -0.3px;
    }

    .payment-details {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 6px 12px;
      margin-top: 14px;
      font-size: 12px;
      line-height: 1.4;
    }

    .payment-label {
      color: var(--pf-text-tertiary);
      font-weight: 500;
    }

    .payment-value {
      min-width: 0;
      font-family: var(--pf-mono);
      word-break: break-word;
      color: var(--pf-text-secondary);
    }

    .payment-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    /* ─── TABS ─── */
    .tab-content {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      margin-top: 12px;
    }

    .tab-pane {
      display: none;
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .tab-pane.active {
      display: block;
    }

    .tab-bar {
      display: flex;
      gap: 0;
      padding: 8px 0 12px;
      border-top: 0.5px solid var(--pf-border);
      margin-top: 8px;
      flex-shrink: 0;
    }

    .tab-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 8px 4px 4px;
      border: none;
      border-radius: var(--pf-radius-sm);
      background: transparent;
      color: var(--pf-text-tertiary);
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.2px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
      box-shadow: none;
    }

    .tab-btn svg {
      width: 18px;
      height: 18px;
      stroke-width: 1.8;
    }

    .tab-btn:hover {
      color: var(--pf-text-secondary);
      background: var(--pf-surface);
      transform: none;
      box-shadow: none;
      filter: none;
    }

    .tab-btn.active {
      color: var(--pf-accent);
      background: var(--pf-accent-soft);
    }

    .tab-btn.active:hover {
      background: var(--pf-accent-soft);
      filter: none;
    }

    /* ─── SCROLLBAR ─── */
    ::-webkit-scrollbar {
      width: 6px;
    }

    ::-webkit-scrollbar-track {
      background: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.08);
      border-radius: 3px;
    }

    ::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.15);
    }
  </style>
</head>
<body>
  <main class="app">
    <section class="header">
      <div class="header-top">
        <div class="logo">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M12 2.25L20 5.25V11.5C20 16.4 16.6 20.75 12 21.75C7.4 20.75 4 16.4 4 11.5V5.25L12 2.25Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>
            <path d="M8.5 12.1L10.8 14.4L15.8 9.4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="title">
          <h1>${EXTENSION_NAME}</h1>
          <div class="subtitle">Autonomous smart contract audit</div>
        </div>
      </div>
      <div class="actions">
        <button id="runAudit" type="button">&#9670; Run Audit</button>
      </div>
    </section>

    <section id="paymentPanel" class="payment-panel">
      <div class="payment-header">
        <div class="payment-title">x402 Payment Required</div>
        <div id="paymentSubtitle" class="payment-subtitle">Approve the simulated payment for the live Apify compliance lookup.</div>
      </div>
      <div class="payment-amount">0.001 USDC</div>
      <div class="payment-details">
        <span class="payment-label">Network:</span>
        <span class="payment-value">Base Sepolia</span>
      </div>
      <div class="payment-actions">
        <button id="cancelPayment" class="btn-secondary" type="button">Cancel</button>
        <button id="approvePayment" type="button">Approve x402</button>
      </div>
    </section>

    <section id="statusCard" class="status">
      <div class="status-row">
        <span id="statusMessage" class="status-label">Ready</span>
        <span id="statePill" class="pill idle">idle</span>
      </div>
      <div id="progressBar" class="progress-bar">
        <div class="progress-bar-fill"></div>
      </div>
    </section>

    <div class="tab-content">
      <div id="tabCode" class="tab-pane active">
        <section class="code-input-section">
          <label for="codeInput" class="code-label">Paste your Solidity code</label>
          <textarea id="codeInput" class="code-textarea" placeholder="// SPDX-License-Identifier: MIT&#10;pragma solidity ^0.8.0;&#10;&#10;contract MyContract {&#10;    ...&#10;}" spellcheck="false"></textarea>
        </section>
      </div>

      <div id="tabLog" class="tab-pane">
        <section class="log-panel">
          <div class="log-section-label">Compliance Analysis</div>
          <div class="log-carousel">
            <div id="logsCompliance" class="logs">
              <div class="empty">Compliance steps will appear here.</div>
            </div>
            <div class="log-nav">
              <button id="logPrevCompliance" class="log-nav-btn" type="button" disabled>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                <span>Back</span>
              </button>
              <span id="logIndexCompliance" class="log-index">–</span>
              <button id="logNextCompliance" class="log-nav-btn" type="button" disabled>
                <span>Next</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>
              </button>
            </div>
          </div>

          <div class="log-section-label">Security &amp; Vulnerability</div>
          <div class="log-carousel">
            <div id="logsSecurity" class="logs">
              <div class="empty">Security steps will appear here.</div>
            </div>
            <div class="log-nav">
              <button id="logPrevSecurity" class="log-nav-btn" type="button" disabled>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                <span>Back</span>
              </button>
              <span id="logIndexSecurity" class="log-index">–</span>
              <button id="logNextSecurity" class="log-nav-btn" type="button" disabled>
                <span>Next</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 6 15 12 9 18"/></svg>
              </button>
            </div>
          </div>
        </section>
      </div>

      <div id="tabReport" class="tab-pane">
        <section id="summary" class="summary visible">
          <div class="summary-header">
            <div class="summary-title">
              <strong>Pre-Flight Report</strong>
              <div id="reportSubtitle" class="summary-subtitle">Analysis result</div>
            </div>
            <button id="mintCertificate" class="action-button btn-success hidden" type="button">&#10003; Mint Certificate</button>
          </div>
          <div id="blockedNote" class="blocked-note"></div>

          <div id="certifiedPanel" class="certified-panel">
            <strong>&#10003; Certificate Minted</strong>
            <div id="certificateHash" class="meta-line"></div>
            <div class="link-row">
              <button id="baseScanLink" class="text-link" type="button"></button>
              <button id="sourcifyLink" class="text-link" type="button"></button>
            </div>
          </div>

          <div class="section">
            <h2 class="section-title">Compliance Suggestions</h2>
            <div id="complianceSuggestions" class="list"></div>
          </div>

          <div class="section">
            <h2 class="section-title">Vulnerability Findings</h2>
            <div id="securityFindings" class="list"></div>
          </div>
        </section>
      </div>
    </div>

    <nav class="tab-bar">
      <button class="tab-btn active" data-tab="tabCode" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        <span>Code</span>
      </button>
      <button class="tab-btn" data-tab="tabLog" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <span>Log</span>
      </button>
      <button class="tab-btn" data-tab="tabReport" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span>Report</span>
      </button>
    </nav>
  </main>

  <script nonce="${nonce}">
    window.__PRE_FLIGHT_MODEL__ = ${modelJson};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";

  for (let index = 0; index < 32; index += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return nonce;
}
