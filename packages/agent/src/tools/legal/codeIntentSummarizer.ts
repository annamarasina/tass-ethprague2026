export interface CodeIntentSummary {
  contractNames: string[];
  publicFunctions: string[];
  externalFunctions: string[];
  adminFunctions: string[];
  adminSignals: string[];
  assetCustodySignals: string[];
  upgradeabilitySignals: string[];
  declaredClaims: string[];
  likelyProtocolType: string;
  summary: string;
}

interface FunctionMatch {
  name: string;
  visibility: "public" | "external";
  signature: string;
  line: number;
}

const ADMIN_PATTERNS = [
  /\bonlyOwner\b/i,
  /\bonlyRole\b/i,
  /\bowner\b/i,
  /\badmin\b/i,
  /\bgovernance\b/i,
  /\bset[A-Z][A-Za-z0-9_]*\b/,
  /\bupdate[A-Z][A-Za-z0-9_]*\b/,
  /\bpause\b/i,
  /\bunpause\b/i,
];

const ASSET_PATTERNS = [
  /\bpayable\b/i,
  /\bdeposit\b/i,
  /\bwithdraw\b/i,
  /\btransfer\b/i,
  /\btransferFrom\b/i,
  /\bsafeTransfer\b/i,
  /\bapprove\b/i,
  /\bbalanceOf\b/i,
  /\bERC20\b/i,
  /\bERC721\b/i,
  /\btoken\b/i,
  /\bvault\b/i,
];

const UPGRADE_PATTERNS = [
  /\bupgrade\b/i,
  /\bimplementation\b/i,
  /\bproxy\b/i,
  /\bdelegatecall\b/i,
  /\bUUPS\b/i,
  /\binitializer\b/i,
  /\bstorage gap\b/i,
  /\b__gap\b/,
];

const DECLARED_CLAIM_PATTERNS = [
  /\bno\s+admin\b/i,
  /\bno\s+owner\b/i,
  /\bfully\s+decentralized\b/i,
  /\btrustless\b/i,
  /\bnon[-\s]?custodial\b/i,
  /\bno\s+custody\b/i,
  /\bimmutable\b/i,
  /\bpermissionless\b/i,
];

export function summarizeCodeIntent(sourceCode: string, readmeText = "", commentsText = ""): CodeIntentSummary {
  const functions = extractFunctions(sourceCode);
  const contractNames = [...sourceCode.matchAll(/\bcontract\s+([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]);
  const adminSignals = findSignals(sourceCode, ADMIN_PATTERNS);
  const assetCustodySignals = findSignals(sourceCode, ASSET_PATTERNS);
  const upgradeabilitySignals = findSignals(sourceCode, UPGRADE_PATTERNS);
  const claimsCorpus = `${readmeText}\n${commentsText}\n${extractComments(sourceCode).join("\n")}`;
  const declaredClaims = findSignals(claimsCorpus, DECLARED_CLAIM_PATTERNS);
  const adminFunctions = functions
    .filter((fn) => ADMIN_PATTERNS.some((pattern) => pattern.test(fn.signature) || pattern.test(fn.name)))
    .map((fn) => fn.name);
  const likelyProtocolType = inferProtocolType(sourceCode, contractNames, assetCustodySignals, upgradeabilitySignals);

  return {
    contractNames,
    publicFunctions: functions.filter((fn) => fn.visibility === "public").map((fn) => fn.name),
    externalFunctions: functions.filter((fn) => fn.visibility === "external").map((fn) => fn.name),
    adminFunctions,
    adminSignals,
    assetCustodySignals,
    upgradeabilitySignals,
    declaredClaims,
    likelyProtocolType,
    summary: buildSummary({
      contractNames,
      likelyProtocolType,
      adminSignals,
      assetCustodySignals,
      upgradeabilitySignals,
      declaredClaims,
    }),
  };
}

function extractFunctions(sourceCode: string): FunctionMatch[] {
  const lines = sourceCode.split(/\r?\n/);
  const matches: FunctionMatch[] = [];
  const functionRegex = /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)[^{;]*(?:\b(public|external)\b)/g;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    let match: RegExpExecArray | null;

    while ((match = functionRegex.exec(line)) !== null) {
      matches.push({
        name: match[1],
        visibility: match[2] as "public" | "external",
        signature: line.trim(),
        line: lineIndex + 1,
      });
    }
  }

  return matches;
}

function extractComments(sourceCode: string): string[] {
  const blockComments = [...sourceCode.matchAll(/\/\*[\s\S]*?\*\//g)].map((match) => match[0]);
  const lineComments = [...sourceCode.matchAll(/\/\/.*/g)].map((match) => match[0]);
  return [...blockComments, ...lineComments].map((comment) =>
    comment.replace(/^\/\*+/, "").replace(/\*+\/$/, "").replace(/^\/\//, "").trim(),
  );
}

function findSignals(corpus: string, patterns: RegExp[]): string[] {
  const signals = new Set<string>();

  for (const pattern of patterns) {
    const match = corpus.match(pattern);
    if (match?.[0]) {
      signals.add(normalizeSignal(match[0]));
    }
  }

  return [...signals];
}

function inferProtocolType(
  sourceCode: string,
  contractNames: string[],
  assetSignals: string[],
  upgradeSignals: string[],
): string {
  const haystack = `${contractNames.join(" ")}\n${sourceCode}`.toLowerCase();

  if (haystack.includes("vault") || haystack.includes("deposit") || haystack.includes("withdraw")) {
    return "vault_or_custody";
  }

  if (haystack.includes("erc20") || haystack.includes("token")) {
    return "token";
  }

  if (haystack.includes("bridge")) {
    return "bridge";
  }

  if (upgradeSignals.length > 0) {
    return "upgradeable_contract";
  }

  if (assetSignals.length > 0) {
    return "asset_handling_contract";
  }

  return "general_smart_contract";
}

function buildSummary(input: {
  contractNames: string[];
  likelyProtocolType: string;
  adminSignals: string[];
  assetCustodySignals: string[];
  upgradeabilitySignals: string[];
  declaredClaims: string[];
}): string {
  const name = input.contractNames[0] ?? "Selected contract";
  const admin = input.adminSignals.length > 0 ? "has admin/owner control signals" : "has no obvious admin keyword signals";
  const custody =
    input.assetCustodySignals.length > 0 ? "appears to handle assets or balances" : "does not obviously custody assets";
  const upgrade =
    input.upgradeabilitySignals.length > 0 ? "has upgradeability/proxy signals" : "has no obvious upgradeability signals";
  const claims =
    input.declaredClaims.length > 0 ? `declares claims such as ${input.declaredClaims.join(", ")}` : "does not declare strong no-admin/no-custody claims";

  return `${name} is classified as ${input.likelyProtocolType}; it ${custody}, ${admin}, ${upgrade}, and ${claims}.`;
}

function normalizeSignal(signal: string): string {
  return signal.replace(/\s+/g, " ").trim().toLowerCase();
}

