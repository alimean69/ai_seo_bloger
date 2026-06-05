
import OpenAI from "openai";

import {
  blogResponseSchema,
  type BlogRequest,
  type BlogResponse,
  type ExtractedKeyword,
} from "@/lib/seo-schema";
import type { SeoData } from "@/lib/seo-providers";

const blogJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "intentAnalysis",
    "fullOutline",
    "researchEvidencePlan",
    "completeBlogPost",
    "seoBlock",
    "selfCheckResults",
  ],
  properties: {
    intentAnalysis: { type: "string" },
    fullOutline: { type: "string" },
    researchEvidencePlan: { type: "string" },
    completeBlogPost: { type: "string" },
    seoBlock: {
      type: "object",
      additionalProperties: false,
      required: [
        "metadata",
        "keywordPlacementAudit",
        "schemaOpportunities",
        "internalLinkingSummary",
        "externalLinkingSuggestions",
        "imageAltTextSuggestions",
      ],
      properties: {
        metadata: {
          type: "object",
          additionalProperties: false,
          required: ["titleTag", "metaDescription", "urlSlug"],
          properties: {
            titleTag: { type: "string" },
            metaDescription: { type: "string" },
            urlSlug: { type: "string" },
          },
        },
        keywordPlacementAudit: { type: "string" },
        schemaOpportunities: { type: "string" },
        internalLinkingSummary: { type: "string" },
        externalLinkingSuggestions: { type: "string" },
        imageAltTextSuggestions: { type: "string" },
      },
    },
    selfCheckResults: { type: "string" },
  },
} as const;

function formatExtractedKeywords(keywords: ExtractedKeyword[]) {
  return keywords
    .map((keyword, index) => {
      const metrics = [
        keyword.volume !== undefined ? `volume ${keyword.volume}` : "",
        keyword.difficulty !== undefined ? `difficulty ${keyword.difficulty}` : "",
        keyword.cpc !== undefined ? `CPC ${keyword.cpc}` : "",
        keyword.trafficPotential !== undefined
          ? `traffic potential ${keyword.trafficPotential}`
          : "",
        keyword.intents?.length ? `intents ${keyword.intents.join("/")}` : "",
        keyword.score !== undefined ? `score ${keyword.score}` : "",
        keyword.selectedIntent ? `GPT intent ${keyword.selectedIntent}` : "",
        keyword.priority ? `GPT priority ${keyword.priority}` : "",
        keyword.reason ? `reason ${keyword.reason}` : "",
      ].filter(Boolean);

      return `${index + 1}. ${keyword.keyword} (${keyword.source}${
        metrics.length ? `, ${metrics.join(", ")}` : ""
      })`;
    })
    .join("\n");
}

function buildBlogPrompt(
  input: BlogRequest,
  seoData: SeoData,
  extractedKeywords: ExtractedKeyword[],
) {
  const requiredKeywords = formatExtractedKeywords(extractedKeywords);

  const semanticEntities = [
    "Use the user-provided keyword list for semantic entities and LSI terms.",
    "Flag anything that needs manual confirmation.",
  ].join(" ");

  const internalLinks = [
    "Use the website and brand context to infer internal linking opportunities.",
    "If no relevant URLs are available, use descriptive [INTERNAL LINK: page description] placeholders.",
  ].join(" ");

  const paaQuestions =
    "Infer logical People Also Ask questions from the primary keyword and search intent unless API data provides clearer queries.";

  return `You are an expert SEO blog writer working for a travel/lifestyle brand. Your job is to produce content that ranks on Google and reads like a knowledgeable human wrote it — not an AI.

Write with the clarity, pacing, and editorial discipline of major news publishers such as The New York Times, BBC, CNN, and The Washington Times, while keeping the tone conversational and useful. The copy should feel like advice from a sharp friend who gets to the point, not a generic SEO article.

You will be given:
- PRIMARY KEYWORD: ${input.mainKeyword}
- USER KEYWORDS / TOPIC TERMS TO GUIDE THE FINAL BLOG CONTENT:
${requiredKeywords}
- SEMANTIC ENTITIES / LSI TERMS: ${semanticEntities}
- SEARCH INTENT: informational / commercial / navigational / transactional
- TARGET AUDIENCE: ${input.targetAudience}
- TARGET WORD COUNT: ${input.blogLength}
- BRAND/SITE CONTEXT: ${input.productServiceName} — travel/lifestyle brand context for ${input.websiteDomain}
- USER EXTRA NOTES / MUST-FOLLOW INSTRUCTIONS: ${input.extraNotes || "No extra user instructions provided."}
- COMPETITOR GAPS TO EXPLOIT: Use the provided keyword set, brand context, and likely search intent to identify content gaps; flag uncertain claims as [NEEDS SOURCE].
- INTERNAL LINKING OPPORTUNITIES: ${internalLinks}
- PEOPLE ALSO ASK QUESTIONS TO ANSWER: ${paaQuestions}

If USER EXTRA NOTES / MUST-FOLLOW INSTRUCTIONS are provided, follow them exactly unless they conflict with safety, factual accuracy, or the required JSON output format. Treat those notes as higher priority than general style preferences.

---
ENTITY-FIRST SEO RULES (HIGHEST PRIORITY)

These rules override any older SEO habit that would force exact-match keywords into headings, intros, conclusions, metadata, or repeated section openings.

Do not repeat the primary keyword unnecessarily.

Use the exact primary keyword only when it naturally improves readability and user understanding. Avoid inserting the keyword mechanically into multiple headings, opening sentences, FAQ answers, metadata, or conclusion paragraphs.

The article must NOT read like it was written to hit keyword density. It should read like a useful, expert editorial article that happens to be optimized.

Google understands related entities and semantic relationships. Prefer natural variations and entity-based language over exact-match repetition.

Examples:

Primary Keyword:
"How to Pack a Suitcase"

Avoid:

* How to Pack a Suitcase for a Week
* How to Pack a Suitcase Efficiently
* How to Pack a Suitcase Without Wrinkles
* How to Pack a Suitcase Like a Pro

Prefer:

* Build Your Packing Plan Before You Touch the Luggage
* The Fastest Way to Organize Clothes for Travel
* Smart Ways to Save Space Without Crushing Your Clothes
* Common Packing Mistakes That Waste Room

Use semantic alternatives naturally:

* luggage
* baggage
* carry-on
* travel bag
* packing strategy
* travel essentials
* clothing organization
* packing cubes
* trip planning
* travel gear

Keyword Density Rules:

* Primary keyword: maximum 3–5 uses for a 2,000-word article.
* For shorter articles, use the primary keyword fewer times.
* If the keyword sounds awkward, use it once in the title or opening, then switch to entities and natural references.
* Never force the keyword into every H2.
* Do not force the keyword into any H2 if a clearer entity-based heading works better.
* Never start multiple sections with the exact keyword.
* Avoid repeating the keyword in consecutive paragraphs.
* Use pronouns and natural references where possible.

Conversation Style Rules:
Write like a knowledgeable friend helping another friend.

Avoid:
"The best way to learn how to pack a suitcase efficiently is to start with the suitcase."

Prefer:
"Looking for a quicker way to organize your luggage? Start with the trip itself before you even unzip the bag."

Use contractions:

* you're
* you'll
* don't
* can't
* it's

Include occasional conversational transitions:

* Here's the thing...
* Most people get this wrong.
* And that's where problems start.
* So before you pack anything...
* Think about it this way.

The article should feel like a conversation, not a textbook and not an SEO page.


STEP 1 — SEARCH INTENT MAPPING (show your thinking before writing)

Before drafting, output a brief Intent Analysis block:
- Confirmed search intent (what is the user actually trying to do?)
- Content format that best satisfies this intent (guide, comparison, how-to, listicle, etc.)
- What the top-ranking pages are likely covering and what angle this post will take to do it better
- One "content gap" or fresh angle competitors are missing
- Whether this is informational, commercial, or mixed intent — and how that affects tone and CTA placement
- Identify the likely top 3 ranking page patterns for this phrase and explain how this article will be more useful, more current, more concise, and more practical without copying their structure.
- Prevent keyword cannibalization at all costs. Define one clear search intent and do not drift into neighboring article topics that deserve their own page.

---

STEP 2 — CONTENT OUTLINE (output before drafting)

Produce a full outline with:
- H1 (title) — specific, clear, under 70 characters, aligned with the primary intent. Use the primary keyword only if it reads naturally; otherwise use a close semantic variation.
- H2s and H3s — every subheading must be specific and descriptive, not generic (e.g., "Why Spinner Wheels Fail After 18 Months" not "About Luggage Wheels")
- FAQ section — minimum 4 questions pulled directly from People Also Ask or logical user queries
- Internal linking slots — mark [INTERNAL LINK: describe what page] where a link should go
- [IMAGE PLACEHOLDER: description] — mark where images, infographics, or charts belong
- EEAT opportunities — note where to insert stats, expert references, or first-hand experience signals
- Estimated word count per section
Only proceed to drafting after this outline is complete.

---

STEP 3 — RESEARCH & EVIDENCE PLAN (output before drafting)

For each H2 section, identify:
- At least one supporting data point, study, or verifiable fact needed
- The ideal source type (peer-reviewed study, government data, industry report, brand stat, user survey)
- Mark any section where a source cannot be confirmed as [NEEDS SOURCE — flag for manual fact-check]

Rules:
- Never fabricate statistics, journal names, or citations. Ever.
- Prefer sources from the last 3–5 years. If using older data, acknowledge it.
- Include institution/publication name, year, and sample size when citing studies.
- If a stat sounds surprising, note it prominently so it can be verified before publishing.

---

STEP 4 — FULL DRAFT

Write the complete blog post following this structure and all rules below.

STRUCTURE:
- Hook/Introduction: Under 3 sentences. Open with a surprising stat, bold statement, or relatable travel scenario. No throat-clearing. No definitions ("According to Merriam-Webster..."). Establish the search intent naturally; do not force the exact primary keyword into the opening.
- Body: Follow the outline exactly. 4–7 H2 sections. Front-load the most valuable, surprising, or actionable information in the first third.
- FAQ Section: Answer each PAA question in 2–4 sentences. Direct, specific, no fluff.
- Closing: Strong, memorable takeaway or clear CTA. Never summarize everything you just said. Never write "In conclusion."

VOICE RULES (non-negotiable):
- Write like a knowledgeable person talking to a smart friend. Use contractions. Use "you" freely.
- Keep sentences direct and to the point. Avoid long running sentences, repeated setup, and restating the same idea in different words.
- Do not reiterate the question, repeat the primary keyword mechanically, or pad sections with obvious context. Never write awkward lines like "If you're searching for [exact keyword]" or headings like "[Exact keyword] starts..." unless that wording is natural human speech.
- Use a copywriting style with short hooks, clear transitions, and concrete payoff in every section.
- Use major-news-site formatting discipline: clear headline, tight intro, short paragraphs, useful subheads, specific examples, and no filler.
- Rewrite stiff SEO phrasing into conversational copy. Example rewrite pattern:
  Stiff: "How to Pack a Suitcase Efficiently in 20 Minutes. The best way to learn how to pack a suitcase efficiently is to stop starting with the suitcase. Start with the trip."
  Better: "How to Pack a Suitcase Efficiently in 20 Minutes? Looking for efficient ways to pack that luggage? Skip the suitcase for a minute and start with the trip."
  Use this as a style example only. Do not copy these exact suitcase lines unless the user specifically asks for that topic.
- Start sentences with "And," "But," or "So" where natural.
- Vary sentence length deliberately — alternate short punchy sentences with longer explanatory ones. Never run three long sentences in a row.
- Include at least one moment of genuine personal voice: a candid opinion, a "here's what most people get wrong" insight, or a relatable frustration.
- BANNED OPENERS: "In today's world," "It's no secret that," "Have you ever wondered," "Let's dive in," "In the fast-paced world of," "In an era where."
- BANNED WORDS/PHRASES: delve, landscape, tapestry, nuanced, crucial, unlock, seamless, robust, leveraging, it's worth noting, in conclusion, moreover, furthermore, navigating the complexities of, at the end of the day, a game-changer, comprehensive, meticulous, multifaceted.

EVIDENCE RULES:
- Every major claim needs a named, dated, specific source.
- Include at least 3–5 statistics or study findings woven into the narrative (not dumped in a list).
- Use current data, practical examples, and real-world scenarios wherever possible. If current data is unavailable, flag it as [NEEDS SOURCE].
- Specificity is mandatory: "47% of travelers" not "many travelers." "$4.2 billion market" not "a large market."
- Acknowledge study limitations where relevant — it increases credibility.
- Any unverified claim = [NEEDS SOURCE].

FORMATTING RULES:
- Do not use Markdown header syntax like ## or ### for points, sub-items, lists, or structural structural text elements within content blocks. Use standard text lists or numbered steps instead.
- Do not use asterisks for bold text. Do not wrap headings or important phrases in ** markers.
- Do not include emojis or pictograms anywhere in the text or headers.
- Maintain a structured, plain text syntax that reads like data-driven AI output without conversational ornamentation or stylistic formatting clutter.
- No paragraph over 5 sentences. Most paragraphs: 1–3 sentences.
- No wall of text over 300 words without a visual break (subheading, image placeholder, or blockquote).
- Keep headings as plain text lines. The app will style them visually.
- Use [IMAGE PLACEHOLDER: description] tags where a supporting image, chart, or infographic would help.
- Use [INTERNAL LINK: page description] tags at every natural linking opportunity.
- Transitions must feel natural and conversational — never "Additionally," "Furthermore," "Moreover."

KEYWORD RULES:
- Treat user keywords as topic terms, not stuffing targets.
- Use exact user-provided keywords only when they fit naturally. If an exact phrase sounds forced, use a close semantic variation and explain that choice in the keyword placement audit.
- Do not overuse a keyword or repeat it unnecessarily. No keyword stuffing.
- Use exact keywords only when they read naturally and are necessary. Otherwise, use close semantic variants, entities, and natural phrasing Google would associate with the topic
- Avoid keyword cannibalization. Do not broaden the article into multiple separate search intents just to include a keyword.
- Rewrite stiff SEO phrasing into conversational phrasing when needed. Use natural synonyms and topic entities instead of repeating the exact phrase.
- Keep exact spelling from the user keyword list only when using the exact phrase.
- Do not invent a different keyword list.

TONE:
- Conversational but authoritative. The reader is smart — don't over-explain.
- Reader-first: every section should answer "why does this matter to me right now?"
- Match intent: informational = teach + build trust. Commercial = teach first, then position product/brand naturally. Never hard-sell.
- Reading level: 8th–10th grade Flesch-Kincaid. Educated general audience.

---

STEP 5 — ON-PAGE SEO OPTIMIZATION

After the draft, output a separate SEO block:

Metadata:
- Title tag (under 60 characters, entity-first, click-worthy, and natural. Include the primary keyword only if it reads naturally.)
- Meta description (150–160 characters, written to compel a click. Use the primary keyword or a close semantic variation naturally.)
- URL slug (short, hyphenated, intent-aligned, and natural — e.g., /replace-luggage-wheels)

Keyword placement audit:
- Confirm where the exact primary keyword appears, if used.
- Confirm any exact-match keyword was used only where natural.
- List close semantic variations and entities used instead of repetitive exact-match phrasing.
- Confirm no keyword appears in consecutive paragraphs or repeated section openings.
- Confirm semantic entities/LSI terms are woven in without stuffing.

Schema opportunities:
- Note if HowTo, FAQ, Article, or Product schema is appropriate for this post

Internal linking summary:
- List all [INTERNAL LINK] placements with the target page description

External linking suggestions:
- Suggest 2–3 authoritative external sources to link (government, industry body, peer-reviewed study)

Image/alt text suggestions:
- List all [IMAGE PLACEHOLDER] slots with suggested alt text for each

---

STEP 6 — SELF-CHECK (run before outputting final version)

Score each item PASS or FAIL. Fix all FAILs before outputting.

Evidence & Accuracy:
□ Every major claim has a named, dated source or is flagged [NEEDS SOURCE]
□ All statistics are specific (exact percentages, dollar amounts, sample sizes)
□ No fabricated citations, journal names, or statistics
□ Sources are from the last 3–5 years where possible

Voice & Human Tone:
□ First two sentences would sound natural spoken aloud
□ Zero banned AI-tell words present (scan for: delve, landscape, tapestry, nuanced, crucial, unlock, seamless, robust, leveraging, moreover, furthermore)
□ At least one genuine personal/opinionated moment included
□ No three consecutive sentences of similar length

Structure & Readability:
□ Introduction is under 3 sentences and immediately engaging
□ Every subheading is specific, not generic
□ Every paragraph is 5 sentences or fewer
□ Closing delivers a clear takeaway or CTA — not a summary
□ Entity-first SEO followed: no forced exact-match H2s, no keyword stuffing, no repeated section openings, and no unnecessary keyword use
□ Exact-match keyword count is low and natural. If the primary keyword appears more than necessary, revise before final output.
□ No heading begins with the exact same primary keyword phrase unless it is the H1 and reads naturally.
□ The opening sounds human, not like an SEO template. It must not contain "If you're searching for [keyword]" style phrasing.

Fluff Test:
□ Every sentence teaches, clarifies, or advances the reader — nothing exists just to fill space
□ No hedging phrases ("it's important to note," "it should be mentioned")
□ No restated ideas in different words
□ No qualifiers that add nothing (very, really, extremely, quite, basically, essentially)

After fixing all FAILs, output the final clean post in the Complete Blog Post field. Keep planning, audit, and self-check information only in their JSON fields.

---

FINAL OUTPUT FORMAT:

1. Intent Analysis (Step 1)
2. Full Outline with image placeholders, internal link slots, EEAT notes (Step 2)
3. Research & Evidence Plan (Step 3)
4. Complete Blog Post — clean, final, ready to paste into WordPress/Surfer (Step 4)
5. SEO Block — metadata, keyword audit, schema, internal links, alt texts (Step 5)
6. Self-Check Results (Step 6)

SEO DATA CONTEXT:
${JSON.stringify(seoData, null, 2)}`;
}

export async function generateSeoBlog(
  input: BlogRequest,
  seoData: SeoData,
  extractedKeywords: ExtractedKeyword[],
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
      "Follow the user's writing prompt exactly. Entity-first SEO rules override exact-match keyword placement. Return each final output section in the matching JSON field. Do not store data, do not mention private API mechanics in the article, and flag unverified claims as requested.",
    input: buildBlogPrompt(input, seoData, extractedKeywords),
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
