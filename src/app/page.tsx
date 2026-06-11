"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Clipboard, Loader2, Sparkles } from "lucide-react";
import { ZodError } from "zod";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  blogRequestSchema,
  type BlogRequest,
  type BlogResponse,
  type ExtractedKeyword,
} from "@/lib/seo-schema";

type BlogForm = Omit<BlogRequest, "forceGenerate">;

type ExistingContentMatch = {
  query: string;
  confidence: number;
  article: {
    id: string;
    title: string;
    handle: string;
    summary: string;
    publishedAt: string | null;
    authorName?: string;
    imageUrl?: string;
    tags: string[];
    url: string;
    bodyPreview: string;
  };
  analysis: {
    matchedReason: string;
    improvementSummary: string;
    cannibalizationRisk: string;
    improvements: Array<{
      area: string;
      articleExcerpt: string;
      currentIssue: string;
      whyItMatters: string;
      recommendedChange: string;
      suggestedCopy: string;
      priority: "high" | "medium" | "low";
    }>;
  };
};

const initialForm: BlogForm = {
  websiteDomain: "",
  mainKeyword: "",
  targetAudience: "",
  blogTone: "Helpful and expert",
  blogLength: "Medium, 1,200 to 1,500 words",
  productServiceName: "",
  extraNotes: "",
};

const toneOptions = [
  "Helpful and expert",
  "Conversational",
  "Professional",
  "Friendly",
  "Persuasive",
];

const lengthOptions = [
  "Short, 700 to 900 words",
  "Medium, 1,200 to 1,500 words",
  "Long, 1,800 to 2,400 words",
];

function formatBlogForCopy(blog: BlogResponse, keywords: ExtractedKeyword[]) {
  return [
    "Keywords",
    keywords.map((keyword) => keyword.keyword).join(", "),
    "",
    "Blog Content",
    stripTextMarkers(blog.completeBlogPost),
  ].join("\n");
}

function wait(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function Home() {
  const [form, setForm] = useState<BlogForm>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [blog, setBlog] = useState<BlogResponse | null>(null);
  const [existingContentMatch, setExistingContentMatch] =
    useState<ExistingContentMatch | null>(null);
  const [extractedKeywords, setExtractedKeywords] = useState<
    ExtractedKeyword[]
  >([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Preparing request...");
  const [copied, setCopied] = useState(false);

  const copyText = useMemo(
    () => (blog ? formatBlogForCopy(blog, extractedKeywords) : ""),
    [blog, extractedKeywords],
  );

  function updateField(name: keyof BlogForm, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
  }

  async function submitGeneration(forceGenerate = false) {
    let progressTimer: number | undefined;
    let phaseTimer: number | undefined;

    setError("");
    setBlog(null);
    setExistingContentMatch(null);
    setExtractedKeywords([]);
    setCopied(false);
    setProgress(8);
    setProgressLabel(
      forceGenerate
        ? "Preparing the new blog draft..."
        : "Checking Shopify for existing content...",
    );

    try {
      const payload = blogRequestSchema.parse({ ...form, forceGenerate });
      setIsGenerating(true);
      progressTimer = window.setInterval(() => {
        setProgress((current) => {
          if (current >= 88) {
            return current;
          }

          if (current < 28) {
            return current + 4;
          }

          if (current < 62) {
            return current + 3;
          }

          return current + 1;
        });
      }, 850);
      phaseTimer = window.setTimeout(() => {
        setProgressLabel(
          forceGenerate
            ? "Writing and formatting the blog..."
            : "Analyzing topic overlap and preparing recommendations...",
        );
      }, 2800);

      const response = await fetch("/api/generate-blog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setProgress(100);
        setError(data?.error || "Unable to generate the blog.");
        return;
      }

      if (data?.existingContentMatch) {
        setProgress(100);
        setProgressLabel("Complete. Showing the matching Shopify article...");
        await wait(550);
        setExistingContentMatch(data.existingContentMatch);
        setExtractedKeywords(data.extractedKeywords ?? []);
        return;
      }

      if (!data?.blog) {
        setProgress(100);
        setError("The blog response was empty. Please try again.");
        return;
      }

      setProgress(100);
      setProgressLabel("Complete. Showing the generated blog...");
      await wait(550);
      setBlog(data.blog);
      setExtractedKeywords(data.extractedKeywords ?? []);
    } catch (caughtError) {
      if (caughtError instanceof ZodError) {
        const errors: Record<string, string> = {};
        caughtError.issues.forEach((issue) => {
          const key = issue.path[0];
          if (typeof key === "string") {
            errors[key] = issue.message;
          }
        });
        setFieldErrors(errors);
        setError("Please fix the highlighted fields.");
      } else {
        setError("Network error. Please check the local server and try again.");
      }
    } finally {
      if (progressTimer) {
        window.clearInterval(progressTimer);
      }
      if (phaseTimer) {
        window.clearTimeout(phaseTimer);
      }
      setIsGenerating(false);
    }
  }

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitGeneration(false);
  }

  async function handleCopy() {
    if (!copyText) {
      return;
    }

    await navigator.clipboard.writeText(copyText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main
      className="creative-shell relative min-h-screen overflow-hidden"
      data-theme="light"
    >
      <div className="creative-orb creative-orb-one" />
      <div className="creative-orb creative-orb-two" />
      <section className="creative-hero relative backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <NoblLogo />
              <div>
                <p className="creative-brand-name">NOBL TRAVEL</p>
                <div className="creative-badge mt-1 inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm">
                  <Sparkles className="size-3.5" />
                  SEO Blog Generator
                </div>
              </div>
            </div>
          </div>
          <div className="max-w-4xl">
            <h1 className="creative-title text-3xl font-semibold tracking-tight sm:text-5xl">
              Generate an SEO blog from your own keyword list.
            </h1>
          </div>
        </div>
      </section>

      <section className="relative mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[420px_1fr] lg:px-8">
        <Card className="creative-card backdrop-blur-xl">
          <CardHeader className="creative-card-header">
            <CardTitle>Blog inputs</CardTitle>
            <CardDescription>
              These fields are sent to the API route for AI writing only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleGenerate}>
              <FieldError message={error} />

              <div className="space-y-2">
                <RequiredLabel htmlFor="websiteDomain">Website domain</RequiredLabel>
                <Input
                  className="creative-control h-11 rounded-xl focus-visible:ring-blue-600"
                  id="websiteDomain"
                  placeholder="nobltravel.com"
                  value={form.websiteDomain}
                  onChange={(event) =>
                    updateField("websiteDomain", event.target.value)
                  }
                />
                <FieldError message={fieldErrors.websiteDomain} />
              </div>

              <div className="space-y-2">
                <RequiredLabel htmlFor="mainKeyword">Keywords</RequiredLabel>
                <Input
                  className="creative-control h-11 rounded-xl focus-visible:ring-blue-600"
                  id="mainKeyword"
                  placeholder="best carry on luggage, lightweight luggage, luggage sets"
                  value={form.mainKeyword}
                  onChange={(event) =>
                    updateField("mainKeyword", event.target.value)
                  }
                />
                <p className="text-xs leading-5 text-slate-500">
                  Enter at least one keyword. Separate multiple keywords with commas.
                </p>
                <FieldError message={fieldErrors.mainKeyword} />
              </div>

              <div className="space-y-2">
                <RequiredLabel htmlFor="targetAudience">Target audience</RequiredLabel>
                <Input
                  className="creative-control h-11 rounded-xl focus-visible:ring-blue-600"
                  id="targetAudience"
                  placeholder="Parents planning premium vacations"
                  value={form.targetAudience}
                  onChange={(event) =>
                    updateField("targetAudience", event.target.value)
                  }
                />
                <FieldError message={fieldErrors.targetAudience} />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                <div className="space-y-2">
                  <RequiredLabel>Blog tone</RequiredLabel>
                  <StyledDropdown
                    options={toneOptions}
                    value={form.blogTone}
                    onChange={(value) => updateField("blogTone", value)}
                  />
                  <FieldError message={fieldErrors.blogTone} />
                </div>

                <div className="space-y-2">
                  <RequiredLabel>Blog length</RequiredLabel>
                  <StyledDropdown
                    options={lengthOptions}
                    value={form.blogLength}
                    onChange={(value) => updateField("blogLength", value)}
                  />
                  <FieldError message={fieldErrors.blogLength} />
                </div>
              </div>

              <div className="space-y-2">
                <RequiredLabel htmlFor="productServiceName">
                  Product/service name
                </RequiredLabel>
                <Input
                  className="creative-control h-11 rounded-xl focus-visible:ring-blue-600"
                  id="productServiceName"
                  placeholder="Nobl Travel planning service"
                  value={form.productServiceName}
                  onChange={(event) =>
                    updateField("productServiceName", event.target.value)
                  }
                />
                <FieldError message={fieldErrors.productServiceName} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="extraNotes">Extra notes</Label>
                <Textarea
                  className="creative-control min-h-28 rounded-xl focus-visible:ring-blue-600"
                  id="extraNotes"
                  placeholder="Mention destinations, offers, brand style, or must-include points."
                  value={form.extraNotes}
                  onChange={(event) =>
                    updateField("extraNotes", event.target.value)
                  }
                />
                <FieldError message={fieldErrors.extraNotes} />
              </div>

              <Button className="creative-submit h-11 w-full rounded-xl shadow-lg" disabled={isGenerating} type="submit">
                {isGenerating ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Sparkles />
                )}
                {isGenerating ? "Generating..." : "Generate Blog"}
              </Button>

              <ExtractedKeywords keywords={extractedKeywords} />
            </form>
          </CardContent>
        </Card>

        <Card className="creative-card min-h-[640px] backdrop-blur-xl">
          <CardHeader className="creative-card-header flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Generated result</CardTitle>
              <CardDescription>
                The final blog package appears here after generation.
              </CardDescription>
            </div>
            <Button
              disabled={!blog}
              onClick={handleCopy}
              size="sm"
              type="button"
              variant="outline"
            >
              {copied ? <Check /> : <Clipboard />}
              {copied ? "Copied" : "Copy Blog"}
            </Button>
          </CardHeader>
          <CardContent>
            {existingContentMatch ? (
              <ExistingContentMatchResult
                isGenerating={isGenerating}
                match={existingContentMatch}
                onGenerateAnyway={() => submitGeneration(true)}
              />
            ) : !blog ? (
              <div className="creative-empty flex min-h-[480px] items-center justify-center rounded-2xl border border-dashed px-6 text-center text-sm leading-6">
                {isGenerating
                  ? <LoadingProgressCircle label={progressLabel} progress={progress} />
                  : "Existing-content checks, generated keywords, and final blog content will show here."}
              </div>
            ) : (
              <article className="space-y-7">
                <KeywordResult keywords={extractedKeywords} />
                <ResultBlock
                  keywords={extractedKeywords}
                  title="Blog Content"
                  content={blog.completeBlogPost}
                />
              </article>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return (
    <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm leading-5 text-red-700">
      {message}
    </p>
  );
}

function StyledDropdown({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        className="creative-dropdown-trigger creative-control flex h-12 w-full items-center justify-between rounded-2xl px-4 text-left text-sm font-medium shadow-sm outline-none transition focus:ring-2 focus:ring-blue-600"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span>{value}</span>
        <ChevronDown
          className={`size-4 opacity-70 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen ? (
        <div className="creative-dropdown-menu mt-2 w-full overflow-hidden rounded-2xl border p-1 shadow-2xl">
          {options.map((option) => {
            const selected = option === value;

            return (
              <button
                className={`creative-dropdown-option flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                  selected ? "is-selected font-semibold" : "font-medium"
                }`}
                key={option}
                onClick={() => {
                  onChange(option);
                  setIsOpen(false);
                }}
                type="button"
              >
                <span className="grid size-4 place-items-center">
                  {selected ? <Check className="size-4" /> : null}
                </span>
                <span>{option}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function NoblLogo() {
  return (
    <svg
      aria-label="NOBL logo"
      className="nobl-logo-svg"
      role="img"
      viewBox="0 0 566 247"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M0 0H493L566 123.5L493 247H0V0Z" fill="currentColor" />
      <text
        fill="white"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="115"
        fontWeight="300"
        letterSpacing="10"
        x="74"
        y="161"
      >
        NOBL
      </text>
    </svg>
  );
}

function LoadingProgressCircle({
  label,
  progress,
}: {
  label: string;
  progress: number;
}) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div
        aria-label={`${safeProgress}% complete`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={safeProgress}
        className="creative-loader relative grid size-40 place-items-center rounded-full"
        role="progressbar"
        style={{
          background: `conic-gradient(#22c55e 0deg, #2563eb ${safeProgress * 3.6}deg, rgba(191,219,254,0.55) 0deg)`,
        }}
      >
        <span className="creative-loader-orbit" />
        <span className="creative-loader-dot creative-loader-dot-one" />
        <span className="creative-loader-dot creative-loader-dot-two" />
        <span className="creative-loader-dot creative-loader-dot-three" />
        <div className="creative-loader-inner absolute inset-4 rounded-full" />
        <div className="creative-loader-core relative flex size-28 flex-col items-center justify-center rounded-full text-white">
          <span className="text-3xl font-semibold leading-none">
            {safeProgress}%
          </span>
          <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-blue-100">
            Creating
          </span>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-950">{label}</p>
        <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
          Checking existing Shopify content first, then generating only when a strong match is not found.
        </p>
      </div>
    </div>
  );
}

function ExistingContentMatchResult({
  match,
  isGenerating,
  onGenerateAnyway,
}: {
  match: ExistingContentMatch;
  isGenerating: boolean;
  onGenerateAnyway: () => void;
}) {
  return (
    <article className="space-y-5">
      <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Existing Shopify topic found
            </p>
            <h2 className="text-xl font-semibold text-slate-950">
              {match.article.title}
            </h2>
            <p className="text-sm leading-6 text-slate-700">
              Confidence: <strong>{match.confidence}%</strong> for {match.query}.
              To avoid keyword cannibalization, improve this existing article unless you intentionally need a separate page.
            </p>
            <a
              className="inline-flex text-sm font-semibold text-blue-700 underline-offset-4 hover:underline"
              href={match.article.url}
              rel="noreferrer"
              target="_blank"
            >
              Open existing article
            </a>
            <a
              className="block break-all rounded-md border border-amber-100 bg-white/70 p-2 text-xs font-semibold leading-5 text-blue-700 underline-offset-4 hover:underline"
              href={match.article.url}
              rel="noreferrer"
              target="_blank"
            >
              {match.article.url}
            </a>
          </div>
          <Button
            disabled={isGenerating}
            onClick={onGenerateAnyway}
            type="button"
            variant="outline"
          >
            {isGenerating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Generate new blog anyway
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-950">
          Improvement summary
        </h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {match.analysis.improvementSummary}
        </p>
        <p className="mt-3 rounded-md border border-red-100 bg-red-50 p-3 text-sm leading-6 text-red-800">
          <strong>Cannibalization risk:</strong> {match.analysis.cannibalizationRisk}
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-slate-950">
          Areas to improve
        </h3>
        <a
          className="inline-flex break-all rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold leading-5 text-blue-700 underline-offset-4 hover:underline"
          href={match.article.url}
          rel="noreferrer"
          target="_blank"
        >
          Existing article link: {match.article.url}
        </a>
        {match.analysis.improvements.map((improvement, index) => (
          <div
            className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm"
            key={`${improvement.area}-${index}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-700 px-2.5 py-1 text-xs font-semibold uppercase text-white shadow-sm shadow-blue-700/20">
                {improvement.priority}
              </span>
              <h4 className="text-sm font-semibold text-slate-950">
                {improvement.area}
              </h4>
            </div>
            <blockquote className="mt-3 border-l-4 border-blue-300 pl-3 text-sm italic leading-6 text-slate-700">
              {improvement.articleExcerpt}
            </blockquote>
            <dl className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
              <div>
                <dt className="font-semibold text-slate-950">Current issue</dt>
                <dd>{improvement.currentIssue}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-950">Why it matters</dt>
                <dd>{improvement.whyItMatters}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-950">Recommended change</dt>
                <dd>{improvement.recommendedChange}</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-950">Suggested copy</dt>
                <dd>{improvement.suggestedCopy}</dd>
              </div>
            </dl>
          </div>
        ))}
      </section>
    </article>
  );
}

function RequiredLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <Label htmlFor={htmlFor}>
      {children} <span className="text-red-600">*</span>
    </Label>
  );
}

function ResultBlock({
  title,
  content,
  keywords = [],
}: {
  title: string;
  content: string;
  keywords?: ExtractedKeyword[];
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-7 text-slate-700 shadow-sm">
        <FormattedText content={content} keywords={keywords} />
      </div>
    </section>
  );
}

function KeywordResult({ keywords }: { keywords: ExtractedKeyword[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Keywords</h2>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 shadow-sm">
        {keywords.map((keyword) => (
          <span
            className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 shadow-sm"
            key={`${keyword.source}-${keyword.keyword}`}
            title={formatKeywordMetrics(keyword)}
          >
            {keyword.keyword}
          </span>
        ))}
      </div>
    </section>
  );
}

function ExtractedKeywords({ keywords }: { keywords: ExtractedKeyword[] }) {
  if (keywords.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-emerald-950">
          Provided keywords
        </h3>
        <p className="mt-1 text-xs leading-5 text-emerald-800">
          These are the manual keywords used in the blog prompt and highlighted in blue in the result.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {keywords.map((keyword) => (
          <span
            className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 shadow-sm"
            key={`${keyword.source}-${keyword.keyword}`}
            title={formatKeywordMetrics(keyword)}
          >
            {keyword.keyword}
          </span>
        ))}
      </div>
    </section>
  );
}

function formatKeywordMetrics(keyword: ExtractedKeyword) {
  const metrics = [
    keyword.volume !== undefined ? `Volume: ${keyword.volume}` : "",
    keyword.difficulty !== undefined ? `Difficulty: ${keyword.difficulty}` : "",
    keyword.cpc !== undefined ? `CPC: ${keyword.cpc}` : "",
    keyword.trafficPotential !== undefined
      ? `Traffic potential: ${keyword.trafficPotential}`
      : "",
    keyword.intents?.length ? `Intent: ${keyword.intents.join(", ")}` : "",
    keyword.score !== undefined ? `Score: ${keyword.score}` : "",
    keyword.selectedIntent ? `GPT intent: ${keyword.selectedIntent}` : "",
    keyword.priority ? `Priority: ${keyword.priority}` : "",
    keyword.reason ? `Reason: ${keyword.reason}` : "",
  ].filter(Boolean);

  return [keyword.source, ...metrics].join(" | ");
}

function FormattedText({
  content,
  keywords = [],
}: {
  content: string;
  keywords?: ExtractedKeyword[];
}) {
  const highlightedKeywords = useMemo(
    () =>
      Array.from(new Set(keywords.map((keyword) => keyword.keyword.trim())))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length),
    [keywords],
  );

  return (
    <div className="space-y-1">
      {content.split("\n").map((line, index) => {
        const cleanedLine = stripTextMarkers(line);
        const formattedLine = formatHeadingLine(cleanedLine);

        if (!line.trim()) {
          return <div aria-hidden="true" className="h-3" key={index} />;
        }

        return (
          <p
            className={
              formattedLine.isHeading
                ? "mt-5 whitespace-pre-wrap text-base font-semibold text-slate-950 first:mt-0"
                : "whitespace-pre-wrap text-[15px] leading-7"
            }
            key={index}
          >
            <HighlightedText
              keywords={highlightedKeywords}
              text={formattedLine.text}
            />
          </p>
        );
      })}
    </div>
  );
}

function HighlightedText({
  text,
  keywords,
}: {
  text: string;
  keywords: string[];
}) {
  if (keywords.length === 0) {
    return text;
  }

  const pattern = new RegExp(
    `(${keywords.map(keywordToFlexiblePattern).join("|")})`,
    "gi",
  );
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const isKeyword = keywords.some((keyword) =>
      new RegExp(`^${keywordToFlexiblePattern(keyword)}$`, "i").test(part),
    );

    if (!isKeyword) {
      return <span key={index}>{part}</span>;
    }

    return (
      <span
        className="keyword-highlight rounded-md bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-800 ring-1 ring-blue-200"
        key={index}
      >
        {part}
      </span>
    );
  });
}

function keywordToFlexiblePattern(value: string) {
  const words = value
    .trim()
    .split(/[\s\u00a0\-–—]+/)
    .filter(Boolean)
    .map(escapeRegExp);

  return words.join("[\\s\\u00a0\\-–—]+");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripTextMarkers(value: string) {
  return value.replace(/\*\*/g, "");
}

function formatHeadingLine(line: string) {
  const trimmed = line.trim();
  const markdownHeading = trimmed.match(/^#{1,6}\s+(.+)$/);
  const labeledHeading = trimmed.match(/^(H[1-6]|Title|Heading)\s*:\s*(.+)$/i);

  if (markdownHeading) {
    return { isHeading: true, text: markdownHeading[1] };
  }

  if (labeledHeading) {
    return { isHeading: true, text: trimmed };
  }

  return { isHeading: false, text: line };
}
