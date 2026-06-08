import OpenAI from "openai";
import { z } from "zod";

import type { ShopifyArticle } from "@/lib/shopify-content";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "best",
  "for",
  "from",
  "how",
  "in",
  "is",
  "of",
  "on",
  "or",
  "the",
  "to",
  "vs",
  "what",
  "which",
  "with",
  "your",
]);

const improvementSchema = z.object({
  matchedReason: z.string(),
  improvementSummary: z.string(),
  cannibalizationRisk: z.string(),
  improvements: z.array(
    z.object({
      area: z.string(),
      articleExcerpt: z.string(),
      currentIssue: z.string(),
      whyItMatters: z.string(),
      recommendedChange: z.string(),
      suggestedCopy: z.string(),
      priority: z.enum(["high", "medium", "low"]),
    }),
  ),
});

const improvementJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "matchedReason",
    "improvementSummary",
    "cannibalizationRisk",
    "improvements",
  ],
  properties: {
    matchedReason: { type: "string" },
    improvementSummary: { type: "string" },
    cannibalizationRisk: { type: "string" },
    improvements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "area",
          "articleExcerpt",
          "currentIssue",
          "whyItMatters",
          "recommendedChange",
          "suggestedCopy",
          "priority",
        ],
        properties: {
          area: { type: "string" },
          articleExcerpt: { type: "string" },
          currentIssue: { type: "string" },
          whyItMatters: { type: "string" },
          recommendedChange: { type: "string" },
          suggestedCopy: { type: "string" },
          priority: { type: "string", enum: ["high", "medium", "low"] },
        },
      },
    },
  },
} as const;

export type ExistingContentAnalysis = z.infer<typeof improvementSchema>;

export type ExistingContentMatch = {
  query: string;
  confidence: number;
  article: Omit<ShopifyArticle, "body"> & { bodyPreview: string };
  analysis: ExistingContentAnalysis;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string) {
  return normalize(value)
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token));
}

function overlapScore(query: string, target: string) {
  const queryTokens = tokens(query);
  const targetTokens = new Set(tokens(target));

  if (queryTokens.length === 0) {
    return 0;
  }

  const matches = queryTokens.filter((token) => targetTokens.has(token)).length;
  return matches / queryTokens.length;
}

function scoreArticle(query: string, article: ShopifyArticle) {
  const normalizedQuery = normalize(query);
  const title = normalize(article.title);
  const handle = normalize(article.handle);
  const body = normalize(article.body).slice(0, 12000);
  const titleOverlap = overlapScore(query, article.title);
  const handleOverlap = overlapScore(query, article.handle);
  const bodyOverlap = overlapScore(query, article.body);

  if (title === normalizedQuery || handle === normalizedQuery) {
    return 100;
  }

  if (title.includes(normalizedQuery)) {
    return 96;
  }

  if (handle.includes(normalizedQuery.replace(/\s+/g, " "))) {
    return 94;
  }

  if (body.includes(normalizedQuery)) {
    return 91;
  }

  return Math.round(
    Math.max(titleOverlap * 92, handleOverlap * 88, bodyOverlap * 82),
  );
}

export function findExistingContentMatch(
  query: string,
  articles: ShopifyArticle[],
  threshold = 90,
) {
  const scored = articles
    .map((article) => ({ article, confidence: scoreArticle(query, article) }))
    .sort((a, b) => b.confidence - a.confidence);
  const best = scored[0];

  if (!best || best.confidence <= threshold) {
    return null;
  }

  return best;
}

export async function analyzeExistingContentImprovement(
  query: string,
  confidence: number,
  article: ShopifyArticle,
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const articleBody = article.body.slice(0, 18000);
  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    instructions:
      "Return strict JSON only. Be direct and specific. Do not recommend creating a new blog when the existing page can be improved.",
    input: `You are an SEO content strategist reviewing an existing Shopify blog post before a new article is generated.

The user wants to write about this phrase:
${query}

Existing article match confidence: ${confidence}%

Existing article:
Title: ${article.title}
URL: ${article.url}
Published at: ${article.publishedAt || "Unknown"}
Summary: ${article.summary || "No summary"}

Article body:
${articleBody}

Task:
Because confidence is above 90%, do not suggest a new competing article. Explain how to improve the existing post instead.

Focus on:
- missing sections or outdated information
- weak intro or headings
- thin areas that need more useful detail
- entity-first SEO improvements without keyword stuffing
- statistics, examples, internal links, FAQs, or schema opportunities
- cannibalization risk if a new page is created

Return only JSON matching the schema. Include 3 to 7 improvements. Each improvement must include a short article excerpt or area label, the issue, why it matters, and a recommended change.`,
    text: {
      format: {
        type: "json_schema",
        name: "existing_content_improvement_response",
        strict: true,
        schema: improvementJsonSchema,
      },
    },
  });

  return improvementSchema.parse(JSON.parse(response.output_text));
}

export function buildExistingContentMatch(
  query: string,
  confidence: number,
  article: ShopifyArticle,
  analysis: ExistingContentAnalysis,
): ExistingContentMatch {
  const { body, ...articleWithoutBody } = article;

  return {
    query,
    confidence,
    article: {
      ...articleWithoutBody,
      bodyPreview: body.slice(0, 700),
    },
    analysis,
  };
}
