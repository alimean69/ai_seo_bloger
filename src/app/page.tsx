"use client";

import { useMemo, useState } from "react";
import { Check, Clipboard, Loader2, Sparkles } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  blogRequestSchema,
  type BlogRequest,
  type BlogResponse,
  type ExtractedKeyword,
} from "@/lib/seo-schema";

const initialForm: BlogRequest = {
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

export default function Home() {
  const [form, setForm] = useState<BlogRequest>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [blog, setBlog] = useState<BlogResponse | null>(null);
  const [extractedKeywords, setExtractedKeywords] = useState<
    ExtractedKeyword[]
  >([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyText = useMemo(
    () => (blog ? formatBlogForCopy(blog, extractedKeywords) : ""),
    [blog, extractedKeywords],
  );

  function updateField(name: keyof BlogRequest, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => ({ ...current, [name]: "" }));
  }

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBlog(null);
    setExtractedKeywords([]);
    setCopied(false);

    try {
      const payload = blogRequestSchema.parse(form);
      setIsGenerating(true);

      const response = await fetch("/api/generate-blog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        setError(data?.error || "Unable to generate the blog.");
        return;
      }

      if (!data?.blog) {
        setError("The blog response was empty. Please try again.");
        return;
      }

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
      setIsGenerating(false);
    }
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
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <Sparkles className="size-4" />
            One-time SEO Blog Generator
          </div>
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">
              Generate an SEO blog from your own keyword list.
            </h1>
            <p className="mt-3 text-base leading-7 text-slate-600">
              Enter the keywords you want used, generate once, and copy the finished blog package.
              No Ahrefs or Search Console keyword calls.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[420px_1fr] lg:px-8">
        <Card>
          <CardHeader>
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
                  <Select
                    value={form.blogTone}
                    onValueChange={(value) => updateField("blogTone", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose tone" />
                    </SelectTrigger>
                    <SelectContent>
                      {toneOptions.map((tone) => (
                        <SelectItem key={tone} value={tone}>
                          {tone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={fieldErrors.blogTone} />
                </div>

                <div className="space-y-2">
                  <RequiredLabel>Blog length</RequiredLabel>
                  <Select
                    value={form.blogLength}
                    onValueChange={(value) => updateField("blogLength", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose length" />
                    </SelectTrigger>
                    <SelectContent>
                      {lengthOptions.map((length) => (
                        <SelectItem key={length} value={length}>
                          {length}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError message={fieldErrors.blogLength} />
                </div>
              </div>

              <div className="space-y-2">
                <RequiredLabel htmlFor="productServiceName">
                  Product/service name
                </RequiredLabel>
                <Input
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
                  id="extraNotes"
                  placeholder="Mention destinations, offers, brand style, or must-include points."
                  value={form.extraNotes}
                  onChange={(event) =>
                    updateField("extraNotes", event.target.value)
                  }
                />
                <FieldError message={fieldErrors.extraNotes} />
              </div>

              <Button className="w-full" disabled={isGenerating} type="submit">
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

        <Card className="min-h-[640px]">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
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
            {!blog ? (
              <div className="flex min-h-[480px] items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 px-6 text-center text-sm leading-6 text-slate-500">
                {isGenerating
                  ? "Writing the blog from your provided keywords..."
                  : "Generated keywords and final blog content will show here."}
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

  return <p className="text-sm leading-5 text-red-600">{message}</p>;
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
      <div className="rounded-md border border-slate-200 bg-white p-4 text-sm leading-7 text-slate-700">
        <FormattedText content={content} keywords={keywords} />
      </div>
    </section>
  );
}

function KeywordResult({ keywords }: { keywords: ExtractedKeyword[] }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Keywords</h2>
      <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-white p-4">
        {keywords.map((keyword) => (
          <span
            className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700"
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
    <section className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-4">
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
            className="rounded-md border border-emerald-200 bg-white px-2.5 py-1 text-xs font-medium text-emerald-950"
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
                ? "mt-3 whitespace-pre-wrap font-semibold text-slate-950 first:mt-0"
                : "whitespace-pre-wrap"
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

  const pattern = new RegExp(`(${keywords.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const isKeyword = keywords.some(
      (keyword) => keyword.toLowerCase() === part.toLowerCase(),
    );

    if (!isKeyword) {
      return <span key={index}>{part}</span>;
    }

    return (
      <span className="font-semibold text-blue-700" key={index}>
        {part}
      </span>
    );
  });
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
