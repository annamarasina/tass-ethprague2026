import type { AuditLogEvent, EmitLog } from "../../interfaces";
import type { CodeIntentSummary } from "./codeIntentSummarizer";
import {
  normalizeLegalKnowledgeRecords,
  type KnowledgeBaseRecord,
  type LegalKnowledgeRecord,
  type LegalKnowledgeProviderOptions,
} from "./legalKnowledgeProvider";
import { SwarmKnowledgeProvider, type SwarmKnowledgeResult } from "./swarmKnowledgeProvider";

export interface ApifyX402LegalProviderOptions extends LegalKnowledgeProviderOptions {
  apifyToken?: string;
  actorId?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
  fallbackProvider?: SwarmKnowledgeProvider;
  x402PaymentTxHash?: string;
}

export interface ApifyX402LegalProviderInput {
  auditId: string;
  intent: CodeIntentSummary;
  sourceExcerpt?: string;
}

export interface ApifyX402LegalResult {
  source: "apify" | "fallback";
  records: LegalKnowledgeRecord[];
  apifyRunId: string;
  x402PaymentTxHash: string;
  warning?: string;
  fallbackSource?: SwarmKnowledgeResult["source"];
}

interface ApifyRunSyncResponse {
  items: unknown[];
  runId?: string;
}

const DEFAULT_APIFY_API_BASE_URL = "https://api.apify.com/v2";
const DEFAULT_TIMEOUT_MS = 25_000;

export class ApifyX402LegalProvider {
  private readonly apifyToken?: string;
  private readonly actorId?: string;
  private readonly apiBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly fallbackProvider: SwarmKnowledgeProvider;
  private readonly maxRecords?: number;
  private readonly configuredPaymentTxHash?: string;

  constructor(options: ApifyX402LegalProviderOptions = {}) {
    const { fallbackProvider, ...fallbackOptions } = options;

    this.apifyToken = options.apifyToken ?? process.env.APIFY_TOKEN;
    this.actorId = options.actorId ?? process.env.APIFY_ACTOR_ID;
    this.apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? process.env.APIFY_API_BASE_URL ?? DEFAULT_APIFY_API_BASE_URL);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fallbackProvider = fallbackProvider ?? new SwarmKnowledgeProvider(fallbackOptions);
    this.maxRecords = options.maxRecords;
    this.configuredPaymentTxHash = options.x402PaymentTxHash ?? process.env.X402_PAYMENT_TX_HASH;
  }

  async loadLegalKnowledge(input: ApifyX402LegalProviderInput, emit?: EmitLog): Promise<ApifyX402LegalResult> {
    const x402PaymentTxHash = this.prepareX402PaymentHash(input.auditId);

    emit?.(event(input.auditId, "legal_payment", "info", "Prepared x402 payment metadata for Apify legal actor", {
      network: process.env.X402_NETWORK ?? "base-sepolia",
      asset: process.env.X402_ASSET ?? "USDC",
      paymentTxHash: x402PaymentTxHash,
      mode: this.configuredPaymentTxHash ? "configured" : "mock",
    }));

    if (!this.apifyToken || !this.actorId) {
      return this.fallback(input.auditId, x402PaymentTxHash, "APIFY_TOKEN or APIFY_ACTOR_ID is not configured", emit);
    }

    try {
      emit?.(event(input.auditId, "legal_scrape", "info", "Calling Apify legal actor", {
        actorId: this.actorId,
      }));

      const response = await this.runActor(input);
      const records = normalizeLegalKnowledgeRecords(normalizeApifyItems(response.items), this.maxRecords);

      if (records.length === 0) {
        return this.fallback(input.auditId, x402PaymentTxHash, "Apify actor returned no usable legal records", emit);
      }

      return {
        source: "apify",
        records,
        apifyRunId: response.runId ?? `apify-${input.auditId}`,
        x402PaymentTxHash,
      };
    } catch (error) {
      return this.fallback(
        input.auditId,
        x402PaymentTxHash,
        error instanceof Error ? error.message : "Apify legal actor call failed",
        emit,
      );
    }
  }

  toLegalSources(records: LegalKnowledgeRecord[]) {
    return this.fallbackProvider.toLegalSources(records);
  }

  private async runActor(input: ApifyX402LegalProviderInput): Promise<ApifyRunSyncResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const actorPath = encodeActorId(this.actorId ?? "");
    const url = `${this.apiBaseUrl}/acts/${actorPath}/run-sync-get-dataset-items?token=${encodeURIComponent(
      this.apifyToken ?? "",
    )}&clean=true`;

    try {
      const response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          auditId: input.auditId,
          intent: input.intent,
          sourceExcerpt: input.sourceExcerpt,
          sources: ["esma_mica", "sec_crypto", "exploit_news", "market_sentiment"],
          payment: {
            protocol: "x402",
            network: process.env.X402_NETWORK ?? "base-sepolia",
            asset: process.env.X402_ASSET ?? "USDC",
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Apify actor returned HTTP ${response.status}`);
      }

      const items = (await response.json()) as unknown;
      if (!Array.isArray(items)) {
        throw new Error("Apify actor response must be a dataset item array");
      }

      return {
        items,
        runId: response.headers.get("x-apify-actor-run-id") ?? undefined,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fallback(
    auditId: string,
    x402PaymentTxHash: string,
    warning: string,
    emit?: EmitLog,
  ): Promise<ApifyX402LegalResult> {
    emit?.(event(auditId, "legal_scrape", "warn", "Using cached legal knowledge fallback", {
      reason: warning,
    }));

    const fallback = await this.fallbackProvider.loadLegalKnowledge();

    return {
      source: "fallback",
      records: fallback.records,
      apifyRunId: `mock-apify-${auditId}`,
      x402PaymentTxHash,
      warning,
      fallbackSource: fallback.source,
    };
  }

  private prepareX402PaymentHash(auditId: string): string {
    return this.configuredPaymentTxHash || mockHash(`${auditId}:x402:${process.env.X402_NETWORK ?? "base-sepolia"}`);
  }
}

function normalizeApifyItems(items: unknown[]): KnowledgeBaseRecord[] {
  return items.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }

    const nestedRecords = pickArray(item.records) ?? pickArray(item.legalRecords) ?? pickArray(item.items);
    if (nestedRecords) {
      return normalizeApifyItems(nestedRecords);
    }

    const title = pickString(item.title) ?? pickString(item.headline) ?? pickString(item.name);
    const url = pickString(item.url) ?? pickString(item.sourceUrl) ?? pickString(item.link);
    const description =
      pickString(item.description) ?? pickString(item.summary) ?? pickString(item.text) ?? pickString(item.content);

    if (!title || !url) {
      return [];
    }

    return [
      {
        source: pickString(item.source) ?? pickString(item.publisher) ?? "apify",
        type: pickString(item.type) ?? pickString(item.category) ?? "regulatory",
        title,
        url,
        description,
        scrapedAt: pickString(item.scrapedAt) ?? pickString(item.publishedAt) ?? new Date().toISOString(),
      },
    ];
  });
}

function event(
  auditId: string,
  phase: AuditLogEvent["phase"],
  level: AuditLogEvent["level"],
  message: string,
  data?: Record<string, unknown>,
): AuditLogEvent {
  return {
    auditId,
    timestamp: new Date().toISOString(),
    phase,
    level,
    message,
    data,
  };
}

function encodeActorId(actorId: string): string {
  return encodeURIComponent(actorId.replace("/", "~"));
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function pickArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mockHash(seed: string): `0x${string}` {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  const chunk = (hash >>> 0).toString(16).padStart(8, "0");
  return `0x${chunk.repeat(8)}`;
}
