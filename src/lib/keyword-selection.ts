import OpenAI from "openai";
import { z } from "zod";

import type { BlogRequest, ExtractedKeyword } from "@/lib/seo-schema";

const keywordSelectionSchema = z.object({
  seedKeyword: z.string(),
  filteredKeywords: z.array(
    z.object({
      keyword: z.string(),
      score: z.number(),
      reason: z.string(),
      intent: z.enum([
        "informational",
        "commercial",
        "transactional",
        "navigational",
      ]),
      priority: z.enum(["high", "medium", "low"]),
    }),
  ),
  top10Keywords: z.array(z.string()).max(10),
  rejectedKeywords: z.array(
    z.object({
      keyword: z.string(),
      reason: z.string(),
    }),
  ),
});

const keywordSelectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["seedKeyword", "filteredKeywords", "top10Keywords", "rejectedKeywords"],
  properties: {
    seedKeyword: { type: "string" },
    filteredKeywords: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["keyword", "score", "reason", "intent", "priority"],
        properties: {
          keyword: { type: "string" },
          score: { type: "number" },
          reason: { type: "string" },
          intent: {
            type: "string",
            enum: [
              "informational",
              "commercial",
              "transactional",
              "navigational",
            ],
          },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
    top10Keywords: {
      type: "array",
      maxItems: 10,
      items: { type: "string" },
    },
    rejectedKeywords: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["keyword", "reason"],
        properties: {
          keyword: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

export type KeywordSelectionResult = z.infer<typeof keywordSelectionSchema>;

function normalizeKeyword(keyword: string) {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildKeywordSelectionPrompt(
  input: BlogRequest,
  keywords: ExtractedKeyword[],
) {
  const keywordRows = keywords.map((keyword) => ({
    keyword: keyword.keyword,
    volume: keyword.volume ?? null,
    difficulty: keyword.difficulty ?? null,
    cpc: keyword.cpc ?? null,
    trafficPotential: keyword.trafficPotential ?? null,
    source: keyword.source,
  }));

  return `You are an expert SEO keyword analyst and search intent optimizer.

You receive raw keyword data from Ahrefs API. Your job is to:

Filter out irrelevant, noisy, or low-value keywords
Identify high SEO potential keywords
Rank keywords based on traffic opportunity and commercial value
Ensure semantic relevance to the seed keyword
Output only high-quality keywords suitable for content creation or SEO targeting

You must be strict. Do NOT include irrelevant or nonsense queries.

SCORING LOGIC (mandatory)

For each keyword compute:

score =
(trafficPotential * 0.6)
+ (volume * 0.3)
+ (cpc * 0.1 if available else 0)
- (difficulty * 3)

If any value is missing:

volume missing -> treat as 0
trafficPotential missing -> estimate = volume * 10
cpc missing -> 0
difficulty missing -> 50
FILTERING RULES (VERY IMPORTANT)

Exclude a keyword if ANY of the following is true:

keyword is not semantically related to the seed topic
keyword is nonsense or unclear intent
keyword has zero volume AND zero trafficPotential
keyword is unrelated commercial intent (example: car trunk, random objects)
keyword is purely informational with no SEO value AND low volume (<20)

Keep ONLY:

travel / luggage related queries (if seed is luggage)
strong commercial intent keywords
high informational SEO potential keywords
product/category keywords
brand comparison keywords
INPUT FORMAT

You will receive:

seedKeyword
list of keywords from Ahrefs API with:
keyword
volume
difficulty
cpc
trafficPotential (if available)
source
OUTPUT FORMAT (STRICT JSON ONLY)

Return:

{
  "seedKeyword": "",
  "filteredKeywords": [
    {
      "keyword": "",
      "score": 0,
      "reason": "",
      "intent": "informational | commercial | transactional | navigational",
      "priority": "high | medium | low"
    }
  ],
  "top10Keywords": [],
  "rejectedKeywords": [
    {
      "keyword": "",
      "reason": ""
    }
  ]
}
RANKING RULES

Priority order:

High trafficPotential (most important)
High volume
Low difficulty (SEO opportunity)
High CPC (commercial value)
Strong semantic match to seed keyword
INTENT CLASSIFICATION RULES
informational -> "what is", "how to", guides
commercial -> "best luggage", "top brands"
transactional -> "buy luggage", "cheap luggage"
navigational -> brand/store names
EXAMPLE BEHAVIOR

If input contains:

"luggage bag"
"costco luggage delsey"
"luggage in car trunk"
"o bag price"
"travel suitcase guide"

You MUST:

keep first 3-4
reject irrelevant ones like car trunk, unrelated products
FINAL INSTRUCTION

Be strict like an SEO agency.

Only return keywords that can realistically rank or generate traffic.

No explanations outside JSON.

Actual input:
${JSON.stringify(
  {
    seedKeyword: input.mainKeyword,
    keywords: keywordRows,
  },
  null,
  2,
)}`;
}

export async function selectTopKeywordsWithGpt(
  input: BlogRequest,
  keywords: ExtractedKeyword[],
): Promise<{
  selectedKeywords: ExtractedKeyword[];
  selection: KeywordSelectionResult;
}> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  if (keywords.length === 0) {
    return {
      selectedKeywords: [],
      selection: {
        seedKeyword: input.mainKeyword,
        filteredKeywords: [],
        top10Keywords: [],
        rejectedKeywords: [],
      },
    };
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    instructions:
      "Return strict JSON only. Do not include explanations outside the JSON object.",
    input: buildKeywordSelectionPrompt(input, keywords),
    text: {
      format: {
        type: "json_schema",
        name: "seo_keyword_selection_response",
        strict: true,
        schema: keywordSelectionJsonSchema,
      },
    },
  });

  const selection = keywordSelectionSchema.parse(JSON.parse(response.output_text));
  const sourceByKeyword = new Map(
    keywords.map((keyword) => [normalizeKeyword(keyword.keyword), keyword]),
  );
  const filteredByKeyword = new Map(
    selection.filteredKeywords.map((keyword) => [
      normalizeKeyword(keyword.keyword),
      keyword,
    ]),
  );
  const selectedKeywords = selection.top10Keywords
    .map((keyword): ExtractedKeyword | null => {
      const normalized = normalizeKeyword(keyword);
      const source = sourceByKeyword.get(normalized);
      const selected = filteredByKeyword.get(normalized);

      if (!source || !selected) {
        return null;
      }

      return {
        ...source,
        keyword: source.keyword,
        score: selected.score,
        reason: selected.reason,
        selectedIntent: selected.intent,
        priority: selected.priority,
      };
    })
    .filter((keyword): keyword is ExtractedKeyword => keyword !== null)
    .slice(0, 10);

  return { selectedKeywords, selection };
}
