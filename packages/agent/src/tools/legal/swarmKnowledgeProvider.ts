import { LegalKnowledgeProvider } from "./legalKnowledgeProvider";
import {
  fallbackLegalKnowledge,
  normalizeLegalKnowledgeRecords,
  type KnowledgeBaseRecord,
  type LegalKnowledgeProviderOptions,
  type LegalKnowledgeRecord,
} from "./legalKnowledgeProvider";

export interface SwarmKnowledgeProviderOptions extends LegalKnowledgeProviderOptions {
  gatewayUrl?: string;
  swarmHash?: string;
  maxBytes?: number;
  fallbackProvider?: LegalKnowledgeProvider;
}

export interface SwarmKnowledgeResult {
  source: "swarm" | "local_fallback";
  records: LegalKnowledgeRecord[];
  swarmHash?: string;
  gatewayUrl?: string;
  warning?: string;
}

const DEFAULT_GATEWAY_URL = "https://bzz.limo";
const DEFAULT_MAX_BYTES = 2_000_000;

export class SwarmKnowledgeProvider {
  private readonly fallbackProvider: LegalKnowledgeProvider;
  private readonly gatewayUrl: string;
  private readonly maxBytes: number;
  private readonly swarmHash?: string;
  private readonly maxRecords?: number;

  constructor(options: SwarmKnowledgeProviderOptions = {}) {
    this.fallbackProvider = options.fallbackProvider ?? new LegalKnowledgeProvider(options);
    this.gatewayUrl = trimTrailingSlash(options.gatewayUrl ?? process.env.LEGAL_KNOWLEDGE_SWARM_GATEWAY ?? DEFAULT_GATEWAY_URL);
    this.swarmHash = options.swarmHash ?? process.env.LEGAL_KNOWLEDGE_SWARM_HASH;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxRecords = options.maxRecords;
  }

  async loadLegalKnowledge(): Promise<SwarmKnowledgeResult> {
    if (!this.swarmHash) {
      return this.localFallback("LEGAL_KNOWLEDGE_SWARM_HASH is not configured");
    }

    try {
      const rawRecords = await this.fetchKnowledgeBase(this.swarmHash);
      const records = normalizeLegalKnowledgeRecords(rawRecords, this.maxRecords);

      if (records.length === 0) {
        return this.localFallback("Swarm payload did not contain usable legal records");
      }

      return {
        source: "swarm",
        records,
        swarmHash: this.swarmHash,
        gatewayUrl: this.gatewayUrl,
      };
    } catch (error) {
      return this.localFallback(error instanceof Error ? error.message : "Swarm legal knowledge fetch failed");
    }
  }

  toLegalSources(records: LegalKnowledgeRecord[]) {
    return this.fallbackProvider.toLegalSources(records);
  }

  private async fetchKnowledgeBase(swarmHash: string): Promise<KnowledgeBaseRecord[]> {
    validateSwarmHash(swarmHash);

    const url = `${this.gatewayUrl}/bzz/${swarmHash}/`;
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Swarm gateway returned HTTP ${response.status}`);
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > this.maxBytes) {
      throw new Error(`Swarm payload is too large: ${contentLength} bytes`);
    }

    const text = await response.text();
    if (text.length === 0) {
      throw new Error("Swarm gateway returned an empty payload");
    }

    if (Buffer.byteLength(text, "utf8") > this.maxBytes) {
      throw new Error(`Swarm payload exceeds ${this.maxBytes} bytes`);
    }

    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error("Swarm payload must be a knowledge-base JSON array");
    }

    return parsed as KnowledgeBaseRecord[];
  }

  private localFallback(warning: string): SwarmKnowledgeResult {
    const records = this.fallbackProvider.loadLegalKnowledge();

    return {
      source: "local_fallback",
      records: records.length > 0 ? records : fallbackLegalKnowledge(),
      swarmHash: this.swarmHash,
      gatewayUrl: this.gatewayUrl,
      warning,
    };
  }
}

function validateSwarmHash(swarmHash: string): void {
  if (!/^[a-fA-F0-9]{64}$/.test(swarmHash)) {
    throw new Error("LEGAL_KNOWLEDGE_SWARM_HASH must be a 64-character Swarm reference");
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
