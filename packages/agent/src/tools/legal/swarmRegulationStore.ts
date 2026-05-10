/**
 * Swarm Regulation Store
 *
 * Uploads fresh regulation data from scrapers to the Swarm decentralized
 * database with timestamps. The scraped regulations are content-addressed
 * so they can be verified and fetched later via lib-verified-fetch.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AuditLogEvent, EmitLog } from "../../interfaces";
import type { ComplianceCategory } from "./complianceCategoryClassifier";
import type { KnowledgeBaseRecord } from "./legalKnowledgeProvider";

export interface SwarmRegulationStoreOptions {
  gatewayUrl?: string;
  postageBatchId?: string;
}

export interface SwarmUploadResult {
  swarmHash: string;
  category: ComplianceCategory;
  recordCount: number;
  uploadedAt: string;
  gatewayUrl: string;
}

export interface RegulationCacheEntry {
  category: ComplianceCategory;
  swarmHash: string;
  recordCount: number;
  uploadedAt: string;
  scrapedAt: string;
}

const DEFAULT_GATEWAY_URL = "https://bzz.limo";
const DEFAULT_POSTAGE_BATCH_ID = "0000000000000000000000000000000000000000000000000000000000000000";
const CACHE_INDEX_PATH = resolve(process.cwd(), "data", "regulation_cache", "index.json");

export class SwarmRegulationStore {
  private readonly gatewayUrl: string;
  private readonly postageBatchId: string;

  constructor(options: SwarmRegulationStoreOptions = {}) {
    this.gatewayUrl = trimTrailingSlash(
      options.gatewayUrl ?? process.env.SWARM_GATEWAY_URL ?? DEFAULT_GATEWAY_URL,
    );
    this.postageBatchId =
      options.postageBatchId ?? process.env.SWARM_POSTAGE_BATCH_ID ?? DEFAULT_POSTAGE_BATCH_ID;
  }

  async uploadRegulations(
    category: ComplianceCategory,
    records: KnowledgeBaseRecord[],
    scrapedAt: string,
    auditId: string,
    emit?: EmitLog,
  ): Promise<SwarmUploadResult | undefined> {
    if (records.length === 0) {
      emit?.(storeEvent(auditId, "warn", "No records to upload to Swarm", { category }));
      return undefined;
    }

    const payload = JSON.stringify({
      category,
      scrapedAt,
      uploadedAt: new Date().toISOString(),
      records,
    });

    emit?.(storeEvent(auditId, "info", `Uploading ${records.length} ${category} regulations to Swarm`, {
      category,
      recordCount: records.length,
      payloadSize: payload.length,
      gateway: this.gatewayUrl,
    }));

    try {
      const url = `${this.gatewayUrl}/bzz?name=${encodeURIComponent(`${category}-regulations.json`)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "swarm-postage-batch-id": this.postageBatchId,
        },
        body: payload,
      });

      if (!response.ok) {
        throw new Error(`Swarm upload returned HTTP ${response.status}: ${await response.text()}`);
      }

      const result = (await response.json()) as { reference?: string };
      const swarmHash = result.reference;

      if (!swarmHash || typeof swarmHash !== "string") {
        throw new Error("Swarm upload did not return a valid reference hash");
      }

      const uploadResult: SwarmUploadResult = {
        swarmHash,
        category,
        recordCount: records.length,
        uploadedAt: new Date().toISOString(),
        gatewayUrl: this.gatewayUrl,
      };

      this.updateCacheIndex(category, swarmHash, records.length, scrapedAt);

      emit?.(storeEvent(auditId, "success", `Regulations uploaded to Swarm: ${swarmHash}`, {
        category,
        swarmHash,
        recordCount: records.length,
        gateway: this.gatewayUrl,
      }));

      return uploadResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Swarm upload failed";
      emit?.(storeEvent(auditId, "warn", `Swarm upload failed: ${message}`, {
        category,
        error: message,
      }));
      return undefined;
    }
  }

  getCachedHash(category: ComplianceCategory): RegulationCacheEntry | undefined {
    const index = this.loadCacheIndex();
    return index[category];
  }

  private updateCacheIndex(
    category: ComplianceCategory,
    swarmHash: string,
    recordCount: number,
    scrapedAt: string,
  ): void {
    const index = this.loadCacheIndex();
    index[category] = {
      category,
      swarmHash,
      recordCount,
      uploadedAt: new Date().toISOString(),
      scrapedAt,
    };

    const dir = resolve(process.cwd(), "data", "regulation_cache");
    const { mkdirSync } = require("node:fs") as typeof import("node:fs");
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(CACHE_INDEX_PATH, JSON.stringify(index, null, 2), "utf8");
  }

  private loadCacheIndex(): Record<ComplianceCategory, RegulationCacheEntry> {
    if (!existsSync(CACHE_INDEX_PATH)) {
      return {} as Record<ComplianceCategory, RegulationCacheEntry>;
    }

    try {
      return JSON.parse(readFileSync(CACHE_INDEX_PATH, "utf8"));
    } catch {
      return {} as Record<ComplianceCategory, RegulationCacheEntry>;
    }
  }
}

function storeEvent(
  auditId: string,
  level: AuditLogEvent["level"],
  message: string,
  data?: Record<string, unknown>,
): AuditLogEvent {
  return {
    auditId,
    timestamp: new Date().toISOString(),
    phase: "swarm_fetch",
    level,
    message,
    data,
  };
}

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
