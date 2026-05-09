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
  x402Mode?: X402Mode;
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

type X402Mode = "mock" | "enforced";

interface PreparedX402Payment {
  transactionHash: string;
  mode: X402Mode;
  mocked: boolean;
}

const DEFAULT_APIFY_API_BASE_URL = "https://api.apify.com/v2";
const DEFAULT_GOOGLE_SEARCH_ACTOR_ID = "apify/google-search-scraper";
const DEFAULT_GOOGLE_SEARCH_COUNTRY = "us";
const DEFAULT_GOOGLE_SEARCH_LANGUAGE = "en";
const DEFAULT_GOOGLE_RESULTS_PER_PAGE = 10;
const DEFAULT_GOOGLE_MAX_PAGES_PER_QUERY = 1;
const ESMA_CRYPTO_NEWS_URL = "https://www.esma.europa.eu/press-news/esma-news?f%5B0%5D=topics%3A1184";
const EBA_HOME_URL = "https://www.eba.europa.eu/homepage";
const DEFAULT_TIMEOUT_MS = 60_000;

export class ApifyX402LegalProvider {
  private readonly apifyToken?: string;
  private readonly actorId?: string;
  private readonly apiBaseUrl: string;
  private readonly timeoutMs: number;
  private readonly fallbackProvider: SwarmKnowledgeProvider;
  private readonly maxRecords?: number;
  private readonly configuredPaymentTxHash?: string;
  private readonly x402Mode: X402Mode;

  constructor(options: ApifyX402LegalProviderOptions = {}) {
    const { fallbackProvider, ...fallbackOptions } = options;

    this.apifyToken = options.apifyToken ?? readOptionalEnv("APIFY_TOKEN");
    this.actorId = options.actorId ?? readOptionalEnv("APIFY_ACTOR_ID") ?? DEFAULT_GOOGLE_SEARCH_ACTOR_ID;
    this.apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? readOptionalEnv("APIFY_API_BASE_URL") ?? DEFAULT_APIFY_API_BASE_URL);
    this.timeoutMs = options.timeoutMs ?? readPositiveIntegerEnv("APIFY_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);
    this.fallbackProvider = fallbackProvider ?? new SwarmKnowledgeProvider(fallbackOptions);
    this.maxRecords = options.maxRecords;
    this.configuredPaymentTxHash = options.x402PaymentTxHash ?? readOptionalEnv("X402_PAYMENT_TX_HASH");
    this.x402Mode = options.x402Mode ?? readX402Mode();
  }

  async loadLegalKnowledge(input: ApifyX402LegalProviderInput, emit?: EmitLog): Promise<ApifyX402LegalResult> {
    const x402Payment = this.prepareX402Payment(input.auditId);
    const x402PaymentTxHash = x402Payment.transactionHash;

    emit?.(event(input.auditId, "legal_payment", "info", "Prepared x402 payment metadata for Apify legal actor", {
      network: process.env.X402_NETWORK ?? "base-sepolia",
      asset: process.env.X402_ASSET ?? "USDC",
      paymentTxHash: x402PaymentTxHash,
      mode: x402Payment.mode,
      mocked: x402Payment.mocked,
    }));

    if (!this.apifyToken) {
      return this.fallback(input.auditId, x402PaymentTxHash, "APIFY_TOKEN is not configured", emit);
    }

    if (!this.actorId) {
      return this.fallback(input.auditId, x402PaymentTxHash, "APIFY_ACTOR_ID is not configured", emit);
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
        body: JSON.stringify(buildGoogleSearchInput(input)),
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

  private prepareX402Payment(auditId: string): PreparedX402Payment {
    if (this.configuredPaymentTxHash) {
      return {
        transactionHash: this.configuredPaymentTxHash,
        mode: this.x402Mode,
        mocked: false,
      };
    }

    if (this.x402Mode === "enforced") {
      throw new Error("X402_MODE=enforced requires a real x402 settlement hash; set X402_PAYMENT_TX_HASH or switch to X402_MODE=mock for local demos.");
    }

    return {
      transactionHash: mockHash(`${auditId}:x402:${process.env.X402_NETWORK ?? "base-sepolia"}`),
      mode: "mock",
      mocked: true,
    };
  }
}

function buildGoogleSearchInput(input: ApifyX402LegalProviderInput): Record<string, unknown> {
  return {
    queries: buildLegalSearchQueries(input).join("\n"),
    resultsPerPage: readPositiveIntegerEnv("APIFY_GOOGLE_RESULTS_PER_PAGE", DEFAULT_GOOGLE_RESULTS_PER_PAGE),
    maxPagesPerQuery: readPositiveIntegerEnv(
      "APIFY_GOOGLE_MAX_PAGES_PER_QUERY",
      DEFAULT_GOOGLE_MAX_PAGES_PER_QUERY,
    ),
    countryCode: process.env.APIFY_GOOGLE_COUNTRY_CODE ?? DEFAULT_GOOGLE_SEARCH_COUNTRY,
    languageCode: process.env.APIFY_GOOGLE_LANGUAGE_CODE ?? DEFAULT_GOOGLE_SEARCH_LANGUAGE,
    searchLanguage: process.env.APIFY_GOOGLE_SEARCH_LANGUAGE ?? DEFAULT_GOOGLE_SEARCH_LANGUAGE,
    includeUnfilteredResults: parseBooleanEnv(process.env.APIFY_GOOGLE_INCLUDE_UNFILTERED_RESULTS, false),
    saveHtml: false,
    saveHtmlToKeyValueStore: false,
    mobileResults: false,
    aiModeSearch: {
      enableAiMode: false,
    },
    perplexitySearch: {
      enablePerplexity: false,
      returnImages: false,
      returnRelatedQuestions: false,
    },
    chatGptSearch: {
      enableChatGpt: false,
    },
  };
}

function buildLegalSearchQueries(input: ApifyX402LegalProviderInput): string[] {
  const keywords = buildComplianceKeywords(input);
  const preferredSources = `${ESMA_CRYPTO_NEWS_URL} and ${EBA_HOME_URL}`;

  return uniqueStrings([
    compactSearchQuery(
      `I want to find the compliance regulation regarding ${keywords} preferably but not necessarily from ${preferredSources}`,
    ),
    compactSearchQuery(`I want to find the compliance regulation regarding ${keywords} ESMA EBA MiCA`),
    compactSearchQuery(`compliance regulation regarding ${keywords} crypto-assets custody disclosure`),
    compactSearchQuery(`regulatory guidance regarding ${keywords} crypto-assets service providers`),
    compactSearchQuery(`site:esma.europa.eu/press-news/esma-news ${keywords} crypto-assets regulation`),
    compactSearchQuery(`site:eba.europa.eu ${keywords} crypto-assets regulation`),
  ]).slice(0, readPositiveIntegerEnv("APIFY_GOOGLE_MAX_QUERIES", 5));
}

function buildComplianceKeywords(input: ApifyX402LegalProviderInput): string {
  const protocolType = input.intent.likelyProtocolType.replace(/_/g, " ");
  const claims = input.intent.declaredClaims.slice(0, 3).join(" ");
  const behaviorTerms = [
    input.intent.assetCustodySignals.length > 0 ? "custody asset handling" : undefined,
    input.intent.adminSignals.length > 0 || input.intent.adminFunctions.length > 0 ? "admin owner control disclosure" : undefined,
    input.intent.upgradeabilitySignals.length > 0 ? "upgradeable proxy disclosure" : undefined,
  ]
    .filter((term): term is string => Boolean(term))
    .join(" ");

  return compactSearchQuery(`${protocolType} ${behaviorTerms} ${claims} crypto-assets`);
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

    const googleResults = normalizeGoogleSearchItem(item);
    if (googleResults.length > 0) {
      return googleResults;
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

function normalizeGoogleSearchItem(item: Record<string, unknown>): KnowledgeBaseRecord[] {
  /*
   * Example apify/google-search-scraper dataset item:
   * {
   *   "searchQuery": {
   *     "term": "I want to find the compliance regulation regarding vault custody crypto-assets..."
   *   },
   *   "organicResults": [
   *     {
   *       "title": "Markets in Crypto-Assets Regulation (MiCA)",
   *       "url": "https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica",
   *       "description": "The Markets in Crypto-Assets Regulation (MiCA) institutes uniform EU market rules..."
   *     }
   *   ],
   *   "paidResults": [],
   *   "suggestedResults": [],
   *   "peopleAlsoAsk": [
   *     {
   *       "question": "What are the MiCA custody requirements?",
   *       "url": "https://www.esma.europa.eu/...",
   *       "answer": "CASPs providing custody and administration of crypto-assets..."
   *     }
   *   ]
   * }
   */
  const query = pickGoogleQuery(item);
  const resultGroups = [
    ["organic", pickArray(item.organicResults)],
    ["organic", pickArray(item.nonPromotedSearchResults)],
    ["paid", pickArray(item.paidResults)],
    ["suggested", pickArray(item.suggestedResults)],
    ["people_also_ask", pickArray(item.peopleAlsoAsk)],
  ] as const;

  return resultGroups.flatMap(([type, results]) => {
    if (!results) {
      return [];
    }

    return results.flatMap((result) => normalizeGoogleSearchResult(result, type, query));
  });
}

function normalizeGoogleSearchResult(result: unknown, type: string, query?: string): KnowledgeBaseRecord[] {
  if (!isRecord(result)) {
    return [];
  }

  const title = pickString(result.title) ?? pickString(result.question) ?? pickString(result.name);
  const url = pickString(result.url) ?? pickString(result.link) ?? pickString(result.displayedUrl);
  const description =
    pickString(result.description) ??
    pickString(result.snippet) ??
    pickString(result.text) ??
    pickString(result.answer) ??
    pickString(result.content);

  if (!title || !url) {
    return [];
  }

  return [
    {
      source: inferGoogleResultSource(url),
      type,
      title,
      url,
      description: query ? `${description ?? "Google Search result"} Search query: ${query}.` : description,
      scrapedAt: new Date().toISOString(),
    },
  ];
}

function inferGoogleResultSource(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes("esma.europa.eu")) {
      return "esma";
    }

    if (hostname.includes("eba.europa.eu")) {
      return "eba";
    }

    if (hostname.includes("eur-lex.europa.eu")) {
      return "eur-lex";
    }

    if (hostname.includes("sec.gov")) {
      return "sec";
    }

    return hostname.replace(/^www\./, "");
  } catch {
    return "google";
  }
}

function pickGoogleQuery(item: Record<string, unknown>): string | undefined {
  const searchQuery = item.searchQuery;
  if (isRecord(searchQuery)) {
    return pickString(searchQuery.term) ?? pickString(searchQuery.query);
  }

  return pickString(item.query) ?? pickString(item.searchTerm);
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

function compactSearchQuery(value: string): string {
  return value
    .replace(/[^\w\s:./"?=&%[\]-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 48)
    .join(" ");
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readX402Mode(): X402Mode {
  const value = readOptionalEnv("X402_MODE")?.toLowerCase();
  if (value === "enforced") {
    return "enforced";
  }

  return "mock";
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
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
