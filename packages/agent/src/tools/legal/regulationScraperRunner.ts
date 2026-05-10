/**
 * Regulation Scraper Runner
 *
 * MCP tool that the AI agent calls after classifying the Solidity contract
 * category. It dispatches to the appropriate regulation scraper based on the
 * compliance category, fetches fresh regulation data from the web, and stores
 * results with timestamps in the Swarm database.
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type { AuditLogEvent, EmitLog } from "../../interfaces";
import type { ComplianceCategory } from "./complianceCategoryClassifier";
import type { KnowledgeBaseRecord } from "./legalKnowledgeProvider";

const execFileAsync = promisify(execFile);

export interface ScraperConfig {
  name: string;
  scraperDir: string;
  command: string;
  args: string[];
  datasetPath: string;
  keywords: string[];
}

export interface RegulationScraperResult {
  category: ComplianceCategory;
  scraperName: string;
  records: KnowledgeBaseRecord[];
  scrapedAt: string;
  uploadedToSwarm: boolean;
  swarmHash?: string;
  error?: string;
}

const DATA_ROOT = resolve(process.cwd(), "data");
const SCRAPERS_ROOT = resolve(DATA_ROOT, "scrapers");

const CATEGORY_SCRAPER_MAP: Record<ComplianceCategory, ScraperConfig[]> = {
  stablecoin: [
    {
      name: "stablecoin-regulation-scraper",
      scraperDir: resolve(SCRAPERS_ROOT, "esma-watchdog"),
      command: "npx",
      args: ["crawlee", "run"],
      datasetPath: resolve(SCRAPERS_ROOT, "esma-watchdog/storage/datasets/default"),
      keywords: ["stablecoin", "e-money", "EMT", "ART", "asset-referenced", "reserve", "MiCA", "peg"],
    },
  ],
  token_offering: [
    {
      name: "token-offering-regulation-scraper",
      scraperDir: resolve(SCRAPERS_ROOT, "esma-watchdog"),
      command: "npx",
      args: ["crawlee", "run"],
      datasetPath: resolve(SCRAPERS_ROOT, "esma-watchdog/storage/datasets/default"),
      keywords: ["white paper", "token offering", "CASP", "prospectus", "MiCA", "issuance"],
    },
  ],
  defi_lending: [
    {
      name: "defi-lending-regulation-scraper",
      scraperDir: resolve(SCRAPERS_ROOT, "esma-watchdog"),
      command: "npx",
      args: ["crawlee", "run"],
      datasetPath: resolve(SCRAPERS_ROOT, "esma-watchdog/storage/datasets/default"),
      keywords: ["DeFi", "lending", "protocol", "liquidity", "MiCA"],
    },
    {
      name: "defi-vulnerability-scraper",
      scraperDir: resolve(SCRAPERS_ROOT, "immunefi-scraper"),
      command: "npx",
      args: ["crawlee", "run"],
      datasetPath: resolve(SCRAPERS_ROOT, "immunefi-scraper/storage/datasets/default"),
      keywords: ["lending", "flash loan", "liquidation", "collateral"],
    },
  ],
  dex: [
    {
      name: "dex-regulation-scraper",
      scraperDir: resolve(SCRAPERS_ROOT, "esma-watchdog"),
      command: "npx",
      args: ["crawlee", "run"],
      datasetPath: resolve(SCRAPERS_ROOT, "esma-watchdog/storage/datasets/default"),
      keywords: ["DEX", "exchange", "trading", "AMM", "MiCA"],
    },
    {
      name: "dex-vulnerability-scraper",
      scraperDir: resolve(SCRAPERS_ROOT, "solodit-scraper"),
      command: "npx",
      args: ["crawlee", "run"],
      datasetPath: resolve(SCRAPERS_ROOT, "solodit-scraper/storage/datasets/default"),
      keywords: ["swap", "AMM", "slippage", "liquidity"],
    },
  ],
  nft: [
    {
      name: "nft-regulation-scraper",
      scraperDir: resolve(SCRAPERS_ROOT, "esma-watchdog"),
      command: "npx",
      args: ["crawlee", "run"],
      datasetPath: resolve(SCRAPERS_ROOT, "esma-watchdog/storage/datasets/default"),
      keywords: ["NFT", "non-fungible", "collectible", "MiCA"],
    },
  ],
  custody: [
    {
      name: "custody-regulation-scraper",
      scraperDir: resolve(SCRAPERS_ROOT, "esma-watchdog"),
      command: "npx",
      args: ["crawlee", "run"],
      datasetPath: resolve(SCRAPERS_ROOT, "esma-watchdog/storage/datasets/default"),
      keywords: ["custody", "safekeeping", "wallet", "CASP", "MiCA"],
    },
  ],
  bridge: [
    {
      name: "bridge-regulation-scraper",
      scraperDir: resolve(SCRAPERS_ROOT, "esma-watchdog"),
      command: "npx",
      args: ["crawlee", "run"],
      datasetPath: resolve(SCRAPERS_ROOT, "esma-watchdog/storage/datasets/default"),
      keywords: ["cross-chain", "bridge", "interoperability", "MiCA"],
    },
    {
      name: "bridge-vulnerability-scraper",
      scraperDir: resolve(SCRAPERS_ROOT, "immunefi-scraper"),
      command: "npx",
      args: ["crawlee", "run"],
      datasetPath: resolve(SCRAPERS_ROOT, "immunefi-scraper/storage/datasets/default"),
      keywords: ["bridge", "cross-chain", "relay"],
    },
  ],
  derivatives: [
    {
      name: "derivatives-regulation-scraper",
      scraperDir: resolve(SCRAPERS_ROOT, "esma-watchdog"),
      command: "npx",
      args: ["crawlee", "run"],
      datasetPath: resolve(SCRAPERS_ROOT, "esma-watchdog/storage/datasets/default"),
      keywords: ["derivatives", "futures", "options", "MiFID", "MiCA"],
    },
  ],
  general: [
    {
      name: "general-regulation-scraper",
      scraperDir: resolve(SCRAPERS_ROOT, "esma-watchdog"),
      command: "npx",
      args: ["crawlee", "run"],
      datasetPath: resolve(SCRAPERS_ROOT, "esma-watchdog/storage/datasets/default"),
      keywords: ["MiCA", "crypto", "regulation"],
    },
  ],
};

export class RegulationScraperRunner {
  private readonly timeoutMs: number;

  constructor(options: { timeoutMs?: number } = {}) {
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  async runForCategory(
    category: ComplianceCategory,
    auditId: string,
    emit?: EmitLog,
  ): Promise<RegulationScraperResult> {
    const scraperConfigs = CATEGORY_SCRAPER_MAP[category] ?? CATEGORY_SCRAPER_MAP.general;
    const allRecords: KnowledgeBaseRecord[] = [];
    const scraperNames: string[] = [];
    const scrapedAt = new Date().toISOString();

    for (const config of scraperConfigs) {
      scraperNames.push(config.name);

      emit?.(scraperEvent(auditId, "info", `Invoking ${config.name} for category "${category}"`, {
        scraperName: config.name,
        category,
        scraperDir: config.scraperDir,
      }));

      try {
        const records = await this.executeScraper(config, auditId, emit);
        const filtered = this.filterByKeywords(records, config.keywords);

        emit?.(scraperEvent(auditId, "success", `${config.name} returned ${filtered.length} relevant records`, {
          scraperName: config.name,
          totalRecords: records.length,
          filteredRecords: filtered.length,
          keywords: config.keywords,
        }));

        allRecords.push(...filtered);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Scraper execution failed";
        emit?.(scraperEvent(auditId, "warn", `${config.name} failed: ${message}`, {
          scraperName: config.name,
          error: message,
        }));
      }
    }

    // Tag all records with scrape timestamp
    for (const record of allRecords) {
      record.scrapedAt = scrapedAt;
    }

    // Store records in local dataset for potential Swarm upload
    const storedPath = this.storeResults(category, allRecords, scrapedAt);

    emit?.(scraperEvent(auditId, "success", `Regulation scraper pipeline complete: ${allRecords.length} records`, {
      category,
      scrapers: scraperNames,
      totalRecords: allRecords.length,
      storedPath,
    }));

    return {
      category,
      scraperName: scraperNames.join(", "),
      records: allRecords,
      scrapedAt,
      uploadedToSwarm: false,
    };
  }

  private async executeScraper(
    config: ScraperConfig,
    auditId: string,
    emit?: EmitLog,
  ): Promise<KnowledgeBaseRecord[]> {
    if (!existsSync(config.scraperDir)) {
      throw new Error(`Scraper directory not found: ${config.scraperDir}`);
    }

    try {
      await execFileAsync(config.command, config.args, {
        cwd: config.scraperDir,
        timeout: this.timeoutMs,
        env: {
          ...process.env,
          NODE_ENV: "production",
        },
      });
    } catch (error) {
      // Scraper may have partially succeeded, still try to read dataset
      emit?.(scraperEvent(auditId, "warn", `Scraper process exited with error, checking dataset`, {
        scraperName: config.name,
        error: error instanceof Error ? error.message : "unknown",
      }));
    }

    return this.readDatasetRecords(config.datasetPath);
  }

  private readDatasetRecords(datasetPath: string): KnowledgeBaseRecord[] {
    if (!existsSync(datasetPath)) {
      return [];
    }

    const records: KnowledgeBaseRecord[] = [];
    const { readdirSync } = require("node:fs") as typeof import("node:fs");
    const files = readdirSync(datasetPath).filter((f: string) => f.endsWith(".json"));

    for (const file of files) {
      try {
        const content = readFileSync(resolve(datasetPath, file), "utf8");
        const parsed = JSON.parse(content);

        if (Array.isArray(parsed)) {
          records.push(...parsed);
        } else if (typeof parsed === "object" && parsed !== null) {
          records.push(parsed as KnowledgeBaseRecord);
        }
      } catch {
        // Skip malformed files
      }
    }

    return records;
  }

  private filterByKeywords(records: KnowledgeBaseRecord[], keywords: string[]): KnowledgeBaseRecord[] {
    if (keywords.length === 0) return records;

    const lowerKeywords = keywords.map((k) => k.toLowerCase());

    return records.filter((record) => {
      const corpus = `${record.title ?? ""}\n${record.description ?? ""}\n${record.source ?? ""}`.toLowerCase();
      return lowerKeywords.some((keyword) => corpus.includes(keyword));
    });
  }

  private storeResults(
    category: ComplianceCategory,
    records: KnowledgeBaseRecord[],
    scrapedAt: string,
  ): string {
    const outputDir = resolve(DATA_ROOT, "regulation_cache");
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const filename = `${category}_${scrapedAt.replace(/[:.]/g, "-")}.json`;
    const outputPath = resolve(outputDir, filename);

    writeFileSync(outputPath, JSON.stringify(records, null, 2), "utf8");
    return outputPath;
  }
}

function scraperEvent(
  auditId: string,
  level: AuditLogEvent["level"],
  message: string,
  data?: Record<string, unknown>,
): AuditLogEvent {
  return {
    auditId,
    timestamp: new Date().toISOString(),
    phase: "compliance_scrape",
    level,
    message,
    data,
  };
}
