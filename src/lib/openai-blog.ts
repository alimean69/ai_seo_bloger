import OpenAI from "openai";

import {
  blogResponseSchema,
  type BlogRequest,
  type BlogResponse,
} from "@/lib/seo-schema";
import type { SeoData } from "@/lib/seo-providers";

const blogJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "seoTitle",
    "metaTitle",
    "metaDescription",
    "urlSlug",
    "blogOutline",
    "fullBlogArticle",
    "faqSection",
    "internalLinkSuggestions",
    "imagePrompt",
    "seoScoreSuggestions",
  ],
  properties: {
    seoTitle: { type: "string" },
    metaTitle: { type: "string" },
    metaDescription: { type: "string" },
    urlSlug: { type: "string" },
    blogOutline: {
      type: "array",
      items: { type: "string" },
    },
    fullBlogArticle: { type: "string" },
    faqSection: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "answer"],
        properties: {
          question: { type: "string" },
          answer: { type: "string" },
        },
      },
    },
    internalLinkSuggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["anchorText", "targetUrl", "reason"],
        properties: {
          anchorText: { type: "string" },
          targetUrl: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
    imagePrompt: { type: "string" },
    seoScoreSuggestions: {
      type: "array",
      items: { type: "string" },
    },
  },
} as const;

export async function generateSeoBlog(
  input: BlogRequest,
  seoData: SeoData,
): Promise<BlogResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const response = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.5",
    instructions:
      "You are an expert SEO strategist and blog writer. Generate useful, accurate, search-focused blog content. Use the provided Ahrefs and Google Search Console data as context, but do not mention private API data sources in the article.",
    input: JSON.stringify(
      {
        request: input,
        seoData,
        requirements: {
          includeSeoTitle: true,
          includeMetaTitle: true,
          includeMetaDescription: true,
          includeUrlSlug: true,
          includeBlogOutline: true,
          includeFullBlogArticle: true,
          includeFaqSection: true,
          includeInternalLinkSuggestions: true,
          includeImagePrompt: true,
          includeSeoScoreSuggestions: true,
        },
      },
      null,
      2,
    ),
    text: {
      format: {
        type: "json_schema",
        name: "seo_blog_response",
        strict: true,
        schema: blogJsonSchema,
      },
    },
  });

  const parsed = JSON.parse(response.output_text);
  return blogResponseSchema.parse(parsed);
}
