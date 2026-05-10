/**
 * Compliance Category Classifier
 *
 * AI agent reads Solidity source code and classifies which regulatory
 * category applies (e.g. stablecoin, token, DeFi lending, etc.).
 * The category drives which regulation scraper to invoke.
 */

import type { CodeIntentSummary } from "./codeIntentSummarizer";

export type ComplianceCategory =
  | "stablecoin"
  | "token_offering"
  | "defi_lending"
  | "dex"
  | "nft"
  | "custody"
  | "bridge"
  | "derivatives"
  | "general";

export interface ComplianceCategoryResult {
  category: ComplianceCategory;
  confidence: number;
  reasoning: string;
  searchQueries: string[];
}

interface CategoryRule {
  category: ComplianceCategory;
  codePatterns: RegExp[];
  protocolTypes: string[];
  signalKeys: Array<keyof Pick<CodeIntentSummary, "assetCustodySignals" | "adminSignals" | "upgradeabilitySignals">>;
  weight: number;
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "stablecoin",
    codePatterns: [
      /\bstable\s?coin\b/i,
      /\bpeg\b/i,
      /\bmint\b.*\bburn\b/is,
      /\bcollateral\b/i,
      /\breserve\b.*\bratio\b/is,
      /\bERC20\b.*\bstable\b/is,
      /\bfiat\b/i,
      /\brebase\b/i,
      /\banchor\b.*\bprice\b/is,
      /\bpeg\s?stability\b/i,
    ],
    protocolTypes: ["token"],
    signalKeys: ["assetCustodySignals"],
    weight: 10,
  },
  {
    category: "token_offering",
    codePatterns: [
      /\bICO\b/i,
      /\bIEO\b/i,
      /\bIDO\b/i,
      /\bpresale\b/i,
      /\bcrowdsale\b/i,
      /\btoken\s?sale\b/i,
      /\bvesting\b/i,
      /\bcliff\b/i,
      /\ballocation\b/i,
      /\bwhitelist\b.*\bmint\b/is,
    ],
    protocolTypes: ["token"],
    signalKeys: ["adminSignals"],
    weight: 8,
  },
  {
    category: "defi_lending",
    codePatterns: [
      /\blend\b/i,
      /\bborrow\b/i,
      /\bcollateral\b/i,
      /\bliquidat/i,
      /\binterest\s?rate\b/i,
      /\bapy\b/i,
      /\bflash\s?loan\b/i,
      /\brepay\b/i,
      /\bhealthFactor\b/i,
      /\bltv\b/i,
    ],
    protocolTypes: ["vault_or_custody", "asset_handling_contract"],
    signalKeys: ["assetCustodySignals"],
    weight: 8,
  },
  {
    category: "dex",
    codePatterns: [
      /\bswap\b/i,
      /\bliquidity\s?pool\b/i,
      /\bamm\b/i,
      /\baddLiquidity\b/i,
      /\bremoveLiquidity\b/i,
      /\bslippage\b/i,
      /\bpair\b/i,
      /\brouter\b/i,
      /\bfactory\b/i,
      /\bgetAmountsOut\b/i,
    ],
    protocolTypes: ["asset_handling_contract"],
    signalKeys: ["assetCustodySignals"],
    weight: 7,
  },
  {
    category: "nft",
    codePatterns: [
      /\bERC721\b/i,
      /\bERC1155\b/i,
      /\btokenURI\b/i,
      /\bmintNFT\b/i,
      /\broyalty\b/i,
      /\bsafeTransferFrom\b/i,
      /\bmetadata\b/i,
      /\bcollection\b/i,
    ],
    protocolTypes: [],
    signalKeys: [],
    weight: 6,
  },
  {
    category: "custody",
    codePatterns: [
      /\bvault\b/i,
      /\bsafe\b/i,
      /\bmultisig\b/i,
      /\bescrow\b/i,
      /\bcustod/i,
      /\btimelock\b/i,
      /\bguardian\b/i,
    ],
    protocolTypes: ["vault_or_custody"],
    signalKeys: ["assetCustodySignals", "adminSignals"],
    weight: 7,
  },
  {
    category: "bridge",
    codePatterns: [
      /\bbridge\b/i,
      /\bcross\s?chain\b/i,
      /\brelay\b/i,
      /\block\b.*\bmint\b/is,
      /\bburn\b.*\bunlock\b/is,
      /\bwrapped\b/i,
      /\bchainId\b/i,
    ],
    protocolTypes: ["bridge"],
    signalKeys: ["assetCustodySignals"],
    weight: 9,
  },
  {
    category: "derivatives",
    codePatterns: [
      /\bfuture\b/i,
      /\boption\b/i,
      /\bperp\b/i,
      /\bmargin\b/i,
      /\bleverage\b/i,
      /\bposition\b/i,
      /\boracle\b/i,
      /\bpriceFeed\b/i,
      /\bhedge\b/i,
    ],
    protocolTypes: [],
    signalKeys: ["assetCustodySignals"],
    weight: 7,
  },
];

const CATEGORY_SEARCH_QUERIES: Record<ComplianceCategory, string[]> = {
  stablecoin: [
    "MiCA stablecoin regulation 2024 2025",
    "EU e-money token regulation requirements",
    "asset-referenced token ART regulation ESMA",
    "stablecoin reserve requirements MiCA",
  ],
  token_offering: [
    "MiCA crypto-asset white paper requirements",
    "EU token offering regulation compliance",
    "ESMA token issuance guidelines 2024 2025",
    "crypto-asset service provider CASP regulation",
  ],
  defi_lending: [
    "EU DeFi lending regulation 2024 2025",
    "MiCA decentralized finance lending compliance",
    "ESMA DeFi protocol supervision guidelines",
    "crypto lending platform regulatory requirements",
  ],
  dex: [
    "EU decentralized exchange regulation MiCA",
    "ESMA DEX AMM compliance requirements",
    "DeFi automated market maker regulation EU",
    "MiCA decentralized trading platform rules",
  ],
  nft: [
    "EU NFT regulation MiCA exemption 2024 2025",
    "ESMA non-fungible token classification",
    "NFT marketplace compliance requirements EU",
  ],
  custody: [
    "MiCA crypto custody service regulation",
    "EU digital asset custody requirements CASP",
    "ESMA custodial wallet regulation guidelines",
    "crypto-asset safekeeping administration rules",
  ],
  bridge: [
    "cross-chain bridge regulation EU 2024 2025",
    "MiCA bridge protocol compliance",
    "ESMA cross-chain asset transfer regulation",
    "wrapped token regulatory classification EU",
  ],
  derivatives: [
    "EU crypto derivatives regulation MiFID MiCA",
    "ESMA crypto derivatives trading compliance",
    "perpetual futures DeFi regulation EU",
    "crypto options margin trading regulation",
  ],
  general: [
    "MiCA regulation smart contract compliance 2024 2025",
    "ESMA crypto-asset regulation latest updates",
    "EU crypto regulatory framework requirements",
  ],
};

export function classifyComplianceCategory(
  sourceCode: string,
  intent: CodeIntentSummary,
): ComplianceCategoryResult {
  const scores: Array<{ category: ComplianceCategory; score: number; matches: string[] }> = [];

  for (const rule of CATEGORY_RULES) {
    let score = 0;
    const matches: string[] = [];

    for (const pattern of rule.codePatterns) {
      if (pattern.test(sourceCode)) {
        score += rule.weight;
        matches.push(pattern.source);
      }
    }

    if (rule.protocolTypes.includes(intent.likelyProtocolType)) {
      score += rule.weight * 0.5;
      matches.push(`protocolType:${intent.likelyProtocolType}`);
    }

    for (const signalKey of rule.signalKeys) {
      if (intent[signalKey].length > 0) {
        score += rule.weight * 0.3;
        matches.push(`signal:${signalKey}(${intent[signalKey].length})`);
      }
    }

    scores.push({ category: rule.category, score, matches });
  }

  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  if (!best || best.score === 0) {
    return {
      category: "general",
      confidence: 0.3,
      reasoning: "No specific regulatory category patterns detected in source code",
      searchQueries: CATEGORY_SEARCH_QUERIES.general,
    };
  }

  const maxPossibleScore = best.score;
  const totalRuleWeight = CATEGORY_RULES.find((r) => r.category === best.category)!;
  const maxTheoreticalScore = totalRuleWeight.codePatterns.length * totalRuleWeight.weight
    + totalRuleWeight.weight * 0.5
    + totalRuleWeight.signalKeys.length * totalRuleWeight.weight * 0.3;
  const confidence = Math.min(0.95, maxPossibleScore / maxTheoreticalScore);

  return {
    category: best.category,
    confidence: Math.round(confidence * 100) / 100,
    reasoning: `Detected ${best.matches.length} signals for ${best.category}: ${best.matches.slice(0, 5).join(", ")}`,
    searchQueries: CATEGORY_SEARCH_QUERIES[best.category],
  };
}
