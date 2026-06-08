import { NextResponse } from "next/server";

import {
  analyzeExistingContentImprovement,
  buildExistingContentMatch,
  findExistingContentMatch,
} from "@/lib/existing-content";
import { generateSeoBlog } from "@/lib/openai-blog";
import { blogRequestSchema, type ExtractedKeyword } from "@/lib/seo-schema";
import type { SeoData } from "@/lib/seo-providers";
import { fetchShopifyNewsArticles } from "@/lib/shopify-content";

export const runtime = "nodejs";

function parseProvidedKeywords(value: string): ExtractedKeyword[] {
  const keywordMap = new Map<string, ExtractedKeyword>();

  value
    .split(/[\n,]+/)
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .forEach((keyword) => {
      const normalized = keyword.toLowerCase().replace(/\s+/g, " ");

      if (!keywordMap.has(normalized)) {
        keywordMap.set(normalized, {
          keyword,
          source: "User",
        });
      }
    });

  return Array.from(keywordMap.values()).slice(0, 10);
}

function buildManualSeoData(keywords: ExtractedKeyword[]): SeoData {
  return {
    ahrefs: {
      matchingTerms: {
        source: "manual_user_input",
        keywords: keywords.map((keyword) => keyword.keyword),
      },
      relatedTerms: [],
      searchSuggestions: [],
      keywordOverview: [],
      scoredKeywords: [],
    },
    googleSearchConsole: {
      startDate: "",
      endDate: "",
      rows: [],
      status: "skipped",
      note: "External SEO keyword APIs are disabled. Keywords were provided manually by the user.",
    },
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = blogRequestSchema.parse(body);
    const extractedKeywords = parseProvidedKeywords(input.mainKeyword);

    if (extractedKeywords.length === 0) {
      throw new Error("Enter at least one keyword.");
    }

    const blogInput = {
      ...input,
      mainKeyword: extractedKeywords[0]?.keyword ?? input.mainKeyword,
    };

    const seoData = buildManualSeoData(extractedKeywords);

    if (!input.forceGenerate) {
      const articles = await fetchShopifyNewsArticles();
      const match = findExistingContentMatch(blogInput.mainKeyword, articles, 90);

      if (match) {
        const analysis = await analyzeExistingContentImprovement(
          blogInput.mainKeyword,
          match.confidence,
          match.article,
        );

        return NextResponse.json({
          existingContentMatch: buildExistingContentMatch(
            blogInput.mainKeyword,
            match.confidence,
            match.article,
            analysis,
          ),
          extractedKeywords,
        });
      }
    }

    const blog = await generateSeoBlog(blogInput, seoData, extractedKeywords);

    return NextResponse.json({
      blog,
      extractedKeywords,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Something went wrong while generating the blog.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
