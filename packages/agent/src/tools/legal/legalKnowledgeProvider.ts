import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LegalSource } from "../../interfaces";

export interface LegalKnowledgeRecord {
  source: LegalSource["sourceType"];
  title: string;
  url: string;
  scrapedAt: string;
  summary: string;
  rawType?: string;
}

export interface LegalKnowledgeProviderOptions {
  knowledgeBasePath?: string;
  maxRecords?: number;
}

export interface KnowledgeBaseRecord {
  source?: string;
  type?: string;
  title?: string;
  url?: string;
  description?: string;
  scrapedAt?: string;
}

const DEFAULT_MAX_RECORDS = 8;

export class LegalKnowledgeProvider {
  private readonly knowledgeBasePath: string;
  private readonly maxRecords: number;

  constructor(options: LegalKnowledgeProviderOptions = {}) {
    this.knowledgeBasePath = options.knowledgeBasePath ?? resolve(process.cwd(), "data", "knowledge_base.json");
    this.maxRecords = options.maxRecords ?? DEFAULT_MAX_RECORDS;
  }

  loadLegalKnowledge(): LegalKnowledgeRecord[] {
    if (!existsSync(this.knowledgeBasePath)) {
      return fallbackLegalKnowledge();
    }

    const parsed = JSON.parse(readFileSync(this.knowledgeBasePath, "utf8")) as KnowledgeBaseRecord[];
    const legalRecords = normalizeLegalKnowledgeRecords(parsed, this.maxRecords);

    return legalRecords.length > 0 ? legalRecords : fallbackLegalKnowledge();
  }

  toLegalSources(records: LegalKnowledgeRecord[]): LegalSource[] {
    return records.map((record) => ({
      title: record.title,
      url: record.url,
      sourceType: record.source,
      fetchedAt: record.scrapedAt,
      summary: record.summary,
    }));
  }
}

export function normalizeLegalKnowledgeRecords(
  records: KnowledgeBaseRecord[],
  maxRecords = DEFAULT_MAX_RECORDS,
): LegalKnowledgeRecord[] {
  return records
    .filter(isLegalRecord)
    .map(normalizeLegalRecord)
    .filter((record): record is LegalKnowledgeRecord => Boolean(record))
    .slice(0, maxRecords);
}

function isLegalRecord(record: KnowledgeBaseRecord): boolean {
  const source = record.source?.toLowerCase() ?? "";
  const type = record.type?.toLowerCase() ?? "";
  const title = record.title?.toLowerCase() ?? "";
  const description = record.description?.toLowerCase() ?? "";
  const corpus = `${source}\n${type}\n${title}\n${description}`;

  return (
    source.includes("esma") ||
    source.includes("eba") ||
    type.includes("regulatory") ||
    corpus.includes("mica") ||
    corpus.includes("markets in crypto-assets") ||
    corpus.includes("crypto-assets regulation")
  );
}

function normalizeLegalRecord(record: KnowledgeBaseRecord): LegalKnowledgeRecord | undefined {
  if (!record.title || !record.url) {
    return undefined;
  }

  return {
    source: inferSourceType(record),
    title: record.title,
    url: record.url,
    scrapedAt: record.scrapedAt ?? new Date(0).toISOString(),
    summary: summarizeRecord(record),
    rawType: record.type,
  };
}

function inferSourceType(record: KnowledgeBaseRecord): LegalSource["sourceType"] {
  const source = record.source?.toLowerCase() ?? "";
  const title = record.title?.toLowerCase() ?? "";

  if (source.includes("eba")) {
    return "eba";
  }

  if (source.includes("esma")) {
    return title.includes("mica") || title.includes("crypto-assets") ? "mica" : "esma";
  }

  return title.includes("mica") ? "mica" : "news";
}

function summarizeRecord(record: KnowledgeBaseRecord): string {
  const source = record.source ? `${record.source}: ` : "";
  const description = record.description ?? record.type ?? "Regulatory update";
  const normalized = description.replace(/\s+/g, " ").trim();
  const capped = normalized.length > 320 ? `${normalized.slice(0, 317)}...` : normalized;
  return `${source}${capped}`;
}

export function fallbackLegalKnowledge(): LegalKnowledgeRecord[] {
  return [
    {
      source: "mica",
      title: "Markets in Crypto-Assets Regulation (MiCA)",
      url: "https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica",
      scrapedAt: new Date(0).toISOString(),
      summary: "Fallback MiCA context for demo mode when local legal knowledge is unavailable.",
      rawType: "Fallback",
    },
  ];
}
