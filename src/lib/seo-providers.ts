import { google } from "googleapis";

import type { BlogRequest } from "@/lib/seo-schema";

type AhrefsPayload = {
  organicKeywords: unknown;
  topPages: unknown;
  metrics: unknown;
};

type GscPayload = {
  startDate: string;
  endDate: string;
  rows: unknown[];
};

export type SeoData = {
  ahrefs: AhrefsPayload;
  googleSearchConsole: GscPayload;
};

function todayMinusDays(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function cleanDomain(domain: string) {
  return domain
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "");
}

async function fetchAhrefsEndpoint(
  endpoint: "organic-keywords" | "top-pages" | "metrics",
  params: Record<string, string>,
) {
  const apiKey = process.env.AHREFS_API_KEY;

  if (!apiKey) {
    throw new Error("Missing AHREFS_API_KEY.");
  }

  const url = new URL(`https://api.ahrefs.com/v3/site-explorer/${endpoint}`);

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
    throw new Error(`Ahrefs ${endpoint} failed: ${response.status} ${body}`);
  }

  return response.json();
}

export async function fetchAhrefsData(input: BlogRequest) {
  const target = cleanDomain(input.websiteDomain);
  const date = todayMinusDays(1);
  const baseParams = {
    target,
    date,
    limit: "20",
  };

  const [organicKeywords, topPages, metrics] = await Promise.all([
    fetchAhrefsEndpoint("organic-keywords", {
      ...baseParams,
      country: "us",
    }),
    fetchAhrefsEndpoint("top-pages", baseParams),
    fetchAhrefsEndpoint("metrics", {
      target,
      date,
    }),
  ]);

  return {
    organicKeywords,
    topPages,
    metrics,
  };
}

export async function fetchGoogleSearchConsoleData(input: BlogRequest) {
  const clientEmail = process.env.GSC_CLIENT_EMAIL;
  const privateKey = process.env.GSC_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const impersonationEmail = process.env.GSC_IMPERSONATION_EMAIL;
  const siteUrl = process.env.GSC_SITE_URL || "sc-domain:nobltravel.com";

  if (!clientEmail || !privateKey || !impersonationEmail) {
    throw new Error(
      "Missing Google Search Console service account environment variables.",
    );
  }

  const endDate = todayMinusDays(3);
  const startDate = todayMinusDays(93);

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    subject: impersonationEmail,
  });

  const searchconsole = google.searchconsole({ version: "v1", auth });
  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions: ["query", "page"],
      dimensionFilterGroups: [
        {
          filters: [
            {
              dimension: "query",
              operator: "contains",
              expression: input.mainKeyword,
            },
          ],
        },
      ],
      rowLimit: 25,
    },
  });

  return {
    startDate,
    endDate,
    rows: response.data.rows ?? [],
  };
}

export async function fetchSeoData(input: BlogRequest): Promise<SeoData> {
  const [ahrefs, googleSearchConsole] = await Promise.all([
    fetchAhrefsData(input),
    fetchGoogleSearchConsoleData(input),
  ]);

  return {
    ahrefs,
    googleSearchConsole,
  };
}
