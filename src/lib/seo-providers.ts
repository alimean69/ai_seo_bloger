import { google } from "googleapis";
import fs from "node:fs";
import path from "node:path";

import type { BlogRequest, ExtractedKeyword } from "@/lib/seo-schema";

type AhrefsPayload = {
  matchingTerms: unknown;
  relatedTerms: unknown;
  searchSuggestions: unknown;
  keywordOverview: unknown[];
  scoredKeywords: KeywordExplorerKeyword[];
};

type KeywordExplorerEndpoint =
  | "matching-terms"
  | "related-terms"
  | "search-suggestions"
  | "overview";

type KeywordExplorerKeyword = ExtractedKeyword & {
  source: "Ahrefs Keywords Explorer";
  sourceEndpoints: string[];
  globalVolume?: number;
  serpLastUpdate?: string;
};

type KeywordPoolItem = Omit<KeywordExplorerKeyword, "source" | "score"> & {
  score?: number;
};

type AhrefsEndpointResult = {
  endpoint: KeywordExplorerEndpoint;
  url: string;
  status: number;
  data: unknown;
};

type GscPayload = {
  startDate: string;
  endDate: string;
  rows: unknown[];
  status?: "skipped";
  note?: string;
};

export type SeoData = {
  ahrefs: AhrefsPayload;
  googleSearchConsole: GscPayload;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function findRows(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  const record = toRecord(value);
  if (!record) {
    return [];
  }

  const rowKeys = ["rows", "data", "keywords", "organic_keywords"];

  for (const key of rowKeys) {
    const rows = findRows(record[key]);
    if (rows.length > 0) {
      return rows;
    }
  }

  return [];
}

function normalizeKeyword(keyword: string) {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

function toStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return undefined;
}

function getKeywordRecord(row: unknown) {
  const record = toRecord(row);

  if (!record || typeof record.keyword !== "string" || !record.keyword.trim()) {
    return null;
  }

  return record;
}

function getKeywordMetrics(record: Record<string, unknown>) {
  return {
    volume: toNumber(record.volume),
    difficulty: toNumber(record.difficulty),
    cpc: toNumber(record.cpc),
    trafficPotential: toNumber(record.traffic_potential),
    intents: toStringArray(record.intents),
    globalVolume: toNumber(record.global_volume),
    serpLastUpdate:
      typeof record.serp_last_update === "string"
        ? record.serp_last_update
        : undefined,
  };
}

function formatKeywordForLog(keyword: ExtractedKeyword | KeywordPoolItem) {
  return withoutUndefined({
    keyword: keyword.keyword,
    source: "source" in keyword ? keyword.source : undefined,
    sourceEndpoints:
      "sourceEndpoints" in keyword ? keyword.sourceEndpoints : undefined,
    volume: keyword.volume,
    difficulty: keyword.difficulty,
    cpc: keyword.cpc,
    trafficPotential: keyword.trafficPotential,
    intents: keyword.intents,
    score: keyword.score,
  });
}

function formatKeywordRowForLog(row: unknown) {
  const record = getKeywordRecord(row);

  if (!record) {
    return row;
  }

  return withoutUndefined({
    keyword: normalizeKeyword(record.keyword as string),
    ...getKeywordMetrics(record),
  });
}

function formatApiCallForLog(call: AhrefsEndpointResult) {
  const rows = findRows(call.data);

  return {
    endpoint: call.endpoint,
    method: "GET",
    url: call.url,
    curl: `curl -X GET "${call.url}" -H "Authorization: Bearer [REDACTED]" -H "Accept: application/json"`,
    status: call.status,
    rowCount: rows.length,
    resultRows: rows.map(formatKeywordRowForLog),
  };
}

export function appendKeywordWorkflowLog(entry: unknown) {
  const logFile =
    process.env.AHREFS_KEYWORD_LOG_FILE ||
    path.join(process.cwd(), "ahrefs-keyword-flow.log");

  try {
    fs.appendFileSync(
      logFile,
      `${JSON.stringify(entry, null, 2)}\n\n`,
      "utf8",
    );
  } catch (error) {
    console.error("Failed to write Ahrefs keyword flow log", error);
  }
}

function withoutUndefined<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

function mergeKeywordRows(
  keywordMap: Map<string, KeywordPoolItem>,
  rows: unknown[],
  sourceEndpoint: string,
) {
  rows.forEach((row) => {
    const record = getKeywordRecord(row);

    if (!record) {
      return;
    }

    const keyword = normalizeKeyword(record.keyword as string);
    const existing = keywordMap.get(keyword);
    const metrics = getKeywordMetrics(record);

    keywordMap.set(keyword, {
      ...existing,
      ...withoutUndefined(metrics),
      keyword: existing?.keyword ?? keyword,
      sourceEndpoints: Array.from(
        new Set([...(existing?.sourceEndpoints ?? []), sourceEndpoint]),
      ),
    });
  });
}

function scoreKeyword(keyword: Pick<
  KeywordExplorerKeyword,
  "trafficPotential" | "volume" | "cpc" | "difficulty"
>) {
  const trafficPotential = keyword.trafficPotential ?? 0;
  const volume = keyword.volume ?? 0;
  const cpc = keyword.cpc ?? 0;
  const difficulty = keyword.difficulty ?? 0;

  return Number(
    (
      trafficPotential * 0.5 +
      volume * 0.3 +
      cpc * 0.2 -
      difficulty * 2
    ).toFixed(2),
  );
}

function rankKeywordPool(keywordMap: Map<string, KeywordPoolItem>) {
  return Array.from(keywordMap.values()).sort((a, b) => {
    const aScore = scoreKeyword(a);
    const bScore = scoreKeyword(b);
    return bScore - aScore;
  });
}

function mergeOverviewMetrics(
  keywordMap: Map<string, KeywordPoolItem>,
  overviewResponses: unknown[],
) {
  overviewResponses.flatMap(findRows).forEach((row) => {
    const record = getKeywordRecord(row);

    if (!record) {
      return;
    }

    const keyword = normalizeKeyword(record.keyword as string);
    const existing = keywordMap.get(keyword);

    if (!existing) {
      return;
    }

    keywordMap.set(keyword, {
      ...existing,
      ...withoutUndefined(getKeywordMetrics(record)),
    });
  });
}

function toScoredKeywords(keywordMap: Map<string, KeywordPoolItem>) {
  return Array.from(keywordMap.values())
    .map((keyword) => ({
      ...keyword,
      source: "Ahrefs Keywords Explorer" as const,
      score: scoreKeyword(keyword),
    }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function getOverviewKeywordLimit() {
  const limit = Number(process.env.AHREFS_OVERVIEW_KEYWORD_LIMIT ?? "0");

  if (!Number.isFinite(limit)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.floor(limit)));
}

function getKeywordDiscoveryLimit() {
  const limit = Number(process.env.AHREFS_KEYWORD_DISCOVERY_LIMIT ?? "4");

  if (!Number.isFinite(limit)) {
    return 4;
  }

  return Math.max(1, Math.min(100, Math.floor(limit)));
}

function addKeyword(
  keywordMap: Map<string, ExtractedKeyword>,
  keyword: string,
  values: ExtractedKeyword,
) {
  const normalized = normalizeKeyword(keyword);
  const existing = keywordMap.get(normalized);

  keywordMap.set(normalized, {
    ...existing,
    ...values,
    keyword: existing?.keyword ?? keyword.trim(),
  });
}

function fallbackKeywordVariants(primaryKeyword: string) {
  const keyword = primaryKeyword.trim();

  if (!keyword) {
    return [];
  }

  return [
    keyword,
    `best ${keyword}`,
    `${keyword} reviews`,
    `${keyword} guide`,
    `${keyword} price`,
    `${keyword} alternatives`,
    `${keyword} discount code`,
    `${keyword} carry on`,
    `${keyword} luggage`,
    `${keyword} travel`,
    `${keyword} bags`,
    `${keyword} set`,
  ];
}

export function extractSeoKeywords(
  seoData: SeoData,
  primaryKeyword: string,
): ExtractedKeyword[] {
  const keywordMap = new Map<string, ExtractedKeyword>();

  seoData.ahrefs.scoredKeywords.slice(0, 20).forEach((keyword) => {
    addKeyword(keywordMap, keyword.keyword, keyword);
  });

  fallbackKeywordVariants(primaryKeyword).forEach((keyword) => {
    if (keywordMap.size >= 20 || keywordMap.has(keyword.toLowerCase())) {
      return;
    }

    addKeyword(keywordMap, keyword, {
      keyword,
      source: "Suggested",
    });
  });

  return Array.from(keywordMap.values())
    .sort((a, b) => {
      const aScore = a.score ?? a.trafficPotential ?? a.volume ?? 0;
      const bScore = b.score ?? b.trafficPotential ?? b.volume ?? 0;
      return bScore - aScore;
    })
    .slice(0, 20);
}

function todayMinusDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function normalizePrivateKey(rawKey: string) {
  let key = rawKey.trim();

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  key = key.replace(/\\n/g, "\n");

  if (key.includes("BEGIN PRIVATE KEY")) {
    return key;
  }

  try {
    const decoded = Buffer.from(key, "base64").toString("utf8").trim();
    const parsed = JSON.parse(decoded) as { private_key?: string };

    if (parsed.private_key) {
      return parsed.private_key.replace(/\\n/g, "\n");
    }
  } catch {
    // Not a base64-encoded service account JSON value.
  }

  try {
    const parsed = JSON.parse(key) as { private_key?: string };

    if (parsed.private_key) {
      return parsed.private_key.replace(/\\n/g, "\n");
    }
  } catch {
    // Not a raw service account JSON value.
  }

  return key;
}

async function fetchAhrefsEndpoint(
  endpoint: KeywordExplorerEndpoint,
  params: Record<string, string>,
): Promise<AhrefsEndpointResult> {
  const apiKey = process.env.AHREFS_API_KEY;

  if (!apiKey) {
    throw new Error("Missing AHREFS_API_KEY.");
  }

  const url = new URL(`https://api.ahrefs.com/v3/keywords-explorer/${endpoint}`);

  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    let errorMessage = body;
    try {
      const parsed = JSON.parse(body);
      if (parsed.error) errorMessage = parsed.error;
    } catch {}
    appendKeywordWorkflowLog({
      event: "ahrefs_keyword_api_error",
      timestamp: new Date().toISOString(),
      endpoint,
      url: url.toString(),
      status: response.status,
      responseBody: errorMessage,
    });
    throw new Error(
      `Ahrefs Keywords Explorer ${endpoint} failed: ${response.status} ${errorMessage}`,
    );
  }

  return {
    endpoint,
    url: url.toString(),
    status: response.status,
    data: await response.json(),
  };
}

export async function fetchAhrefsData(input: BlogRequest) {
  const keywordMap = new Map<string, KeywordPoolItem>();
  const country = "us";
  const discoveryLimit = getKeywordDiscoveryLimit();
  const baseParams = {
    keywords: input.mainKeyword,
    country,
    limit: String(discoveryLimit),
    select: "keyword,volume,difficulty,cpc,intents,traffic_potential",
  };

  const [matchingTermsCall, relatedTermsCall, searchSuggestionsCall] =
    await Promise.all([
      fetchAhrefsEndpoint("matching-terms", baseParams),
      fetchAhrefsEndpoint("related-terms", baseParams),
      fetchAhrefsEndpoint("search-suggestions", baseParams),
    ]);

  const matchingTerms = matchingTermsCall.data;
  const relatedTerms = relatedTermsCall.data;
  const searchSuggestions = searchSuggestionsCall.data;

  mergeKeywordRows(keywordMap, findRows(matchingTerms), "matching-terms");
  mergeKeywordRows(keywordMap, findRows(relatedTerms), "related-terms");
  mergeKeywordRows(keywordMap, findRows(searchSuggestions), "search-suggestions");

  const mergedKeywordPool = rankKeywordPool(keywordMap);
  const overviewKeywordLimit = getOverviewKeywordLimit();

  const overviewKeywords = mergedKeywordPool
    .slice(0, overviewKeywordLimit)
    .map((keyword) => keyword.keyword);
  let keywordOverviewCalls: AhrefsEndpointResult[] = [];
  let keywordOverviewError: string | undefined;

  if (overviewKeywords.length > 0) {
    try {
      keywordOverviewCalls = await Promise.all(
        chunk(overviewKeywords, 50).map((keywords) =>
          fetchAhrefsEndpoint("overview", {
            country,
            keywords: keywords.join(","),
            select:
              "keyword,volume,difficulty,cpc,traffic_potential,intents,global_volume,serp_last_update",
          }),
        ),
      );
    } catch (error) {
      keywordOverviewError =
        error instanceof Error
          ? error.message
          : "Ahrefs Keywords Explorer overview failed.";
    }
  }

  const keywordOverview = keywordOverviewCalls.map((call) => call.data);

  mergeOverviewMetrics(keywordMap, keywordOverview);
  const scoredKeywords = toScoredKeywords(keywordMap).slice(0, 20);

  appendKeywordWorkflowLog({
    event: "ahrefs_keyword_workflow",
    timestamp: new Date().toISOString(),
    seedKeyword: input.mainKeyword,
    country,
    configuredLimits: {
      discoveryLimitPerEndpoint: discoveryLimit,
      overviewKeywordLimit,
    },
    scoreFormula:
      "score = (traffic_potential * 0.5) + (volume * 0.3) + (cpc * 0.2) - (difficulty * 2)",
    step1MatchingTerms: {
      description:
        "Returns keywords that directly match or closely contain the seed keyword.",
      apiCall: formatApiCallForLog(matchingTermsCall),
    },
    step2RelatedTerms: {
      description:
        "Returns semantically related topic-level keyword expansions.",
      apiCall: formatApiCallForLog(relatedTermsCall),
    },
    step3SearchSuggestions: {
      description:
        "Returns real user search queries from Google autocomplete.",
      apiCall: formatApiCallForLog(searchSuggestionsCall),
    },
    step4MergeKeywordPool: {
      description:
        "Combines matching terms, related terms, and search suggestions, then lowercases, trims, and deduplicates keywords.",
      inputRowCounts: {
        matchingTerms: findRows(matchingTerms).length,
        relatedTerms: findRows(relatedTerms).length,
        searchSuggestions: findRows(searchSuggestions).length,
      },
      uniqueKeywordCount: mergedKeywordPool.length,
      masterKeywordPool: mergedKeywordPool.map(formatKeywordForLog),
    },
    step5KeywordOverview: {
      description:
        "Fetches deeper SEO metrics for the highest-quality keywords from the merged pool.",
      overviewKeywordLimit,
      status:
        overviewKeywordLimit === 0
          ? "skipped_disabled"
          : keywordOverviewError
            ? "failed_skipped"
            : "completed",
      error: keywordOverviewError,
      selectedKeywordCount: overviewKeywords.length,
      selectedKeywords: overviewKeywords,
      apiCalls: keywordOverviewCalls.map(formatApiCallForLog),
    },
    step6KeywordScoringAndRanking: {
      description:
        "Ranks keywords by traffic potential, volume, CPC, and difficulty.",
      top20PerformingKeywords: scoredKeywords.map(formatKeywordForLog),
      top10KeywordsSentToBlog: scoredKeywords
        .slice(0, 10)
        .map(formatKeywordForLog),
    },
  });

  return {
    matchingTerms,
    relatedTerms,
    searchSuggestions,
    keywordOverview,
    scoredKeywords,
  };
}

function resolveServiceAccountFile() {
  return process.env.GSC_SERVICE_ACCOUNT_FILE || "gog-local-489321-f2ece1fd0e09.json";
}

function isPlaceholderValue(value: string | undefined) {
  return !value || value.trim().startsWith("<") || value.trim().endsWith(">");
}

export async function fetchGoogleSearchConsoleData() {
  const clientEmail = isPlaceholderValue(process.env.GSC_CLIENT_EMAIL)
    ? undefined
    : process.env.GSC_CLIENT_EMAIL;
  const privateKey = isPlaceholderValue(process.env.GSC_PRIVATE_KEY)
    ? undefined
    : normalizePrivateKey(process.env.GSC_PRIVATE_KEY as string);
  const impersonationEmail = process.env.GSC_IMPERSONATION_EMAIL;
  const siteUrl = process.env.GSC_SITE_URL || "sc-domain:nobltravel.com";
  const endDate = todayMinusDays(3);
  const startDate = todayMinusDays(93);

  if (process.env.GSC_USE_AUTH === "false") {
    return {
      startDate,
      endDate,
      rows: [],
      status: "skipped" as const,
      note:
        "Google Search Console auth is skipped for this local run; do not treat rows as live GSC data.",
    };
  }

  if (!impersonationEmail) {
    return {
      startDate,
      endDate,
      rows: [],
      status: "skipped" as const,
      note:
        "Google Search Console skipped because the impersonation email is missing.",
    };
  }

  const keyFile = clientEmail && privateKey ? undefined : resolveServiceAccountFile();

  if (!clientEmail && !privateKey && keyFile && !fs.existsSync(keyFile)) {
    return {
      startDate,
      endDate,
      rows: [],
      status: "skipped" as const,
      note: `Google Search Console skipped because the service account file was not found at ${keyFile}.`,
    };
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    keyFile,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    subject: impersonationEmail,
  });

  const searchconsole = google.searchconsole({ version: "v1", auth });
  let response;

  try {
    response = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["query", "page"],
        rowLimit: 2500,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (message.includes("DECODER routines")) {
      throw new Error(
        "Google Search Console private key could not be parsed. Set GSC_PRIVATE_KEY to the service account private_key with escaped newlines, or paste a base64-encoded service account JSON.",
      );
    }

    throw error;
  }

  return {
    startDate,
    endDate,
    rows: response.data.rows ?? [],
  };
}

export async function fetchSeoData(input: BlogRequest): Promise<SeoData> {
  const [ahrefs, googleSearchConsole] = await Promise.all([
    fetchAhrefsData(input),
    fetchGoogleSearchConsoleData(),
  ]);

  return {
    ahrefs,
    googleSearchConsole,
  };
}
