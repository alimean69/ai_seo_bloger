import { z } from "zod";

export const blogRequestSchema = z.object({
  websiteDomain: z
    .string()
    .trim()
    .min(3, "Enter a valid website domain.")
    .max(120, "Domain is too long."),
  mainKeyword: z
    .string()
    .trim()
    .min(2, "Enter a main keyword.")
    .max(160, "Keyword is too long."),
  targetAudience: z
    .string()
    .trim()
    .min(2, "Enter a target audience.")
    .max(220, "Audience is too long."),
  blogTone: z.string().trim().min(2, "Choose a blog tone.").max(80),
  blogLength: z.string().trim().min(2, "Choose a blog length.").max(80),
  productServiceName: z
    .string()
    .trim()
    .min(2, "Enter a product or service name.")
    .max(160, "Name is too long."),
  extraNotes: z.string().trim().max(1200, "Notes are too long.").optional(),
});

export const blogResponseSchema = z.object({
  seoTitle: z.string(),
  metaTitle: z.string(),
  metaDescription: z.string(),
  urlSlug: z.string(),
  blogOutline: z.array(z.string()),
  fullBlogArticle: z.string(),
  faqSection: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    }),
  ),
  internalLinkSuggestions: z.array(
    z.object({
      anchorText: z.string(),
      targetUrl: z.string(),
      reason: z.string(),
    }),
  ),
  imagePrompt: z.string(),
  seoScoreSuggestions: z.array(z.string()),
});

export type BlogRequest = z.infer<typeof blogRequestSchema>;
export type BlogResponse = z.infer<typeof blogResponseSchema>;
