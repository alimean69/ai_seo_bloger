import fs from "node:fs";
import path from "node:path";

export type ShopifyArticle = {
  id: string;
  title: string;
  handle: string;
  body: string;
  summary: string;
  publishedAt: string | null;
  authorName?: string;
  imageUrl?: string;
  tags: string[];
  url: string;
};

type ShopifyBlogResponse = {
  data?: {
    blogs?: {
      edges?: Array<{
        node: {
          articles: {
            pageInfo: {
              hasNextPage: boolean;
              endCursor?: string | null;
            };
            edges: Array<{
              node: {
                id: string;
                title: string;
                handle: string;
                body?: string;
                summary?: string;
                publishedAt?: string | null;
                author?: { name?: string | null } | null;
                image?: { url?: string | null } | null;
                tags?: string[];
              };
            }>;
          };
        };
      }>;
    };
  };
  errors?: Array<{ message: string }>;
};

type ShopifyArticleEdge = NonNullable<
  NonNullable<
    NonNullable<ShopifyBlogResponse["data"]>["blogs"]
  >["edges"]
>[number]["node"]["articles"]["edges"][number];

export function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function readLocalEnvValue(name: string) {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const envText = fs.readFileSync(envPath, "utf8");
    const line = envText
      .split(/\r?\n/)
      .find((entry) => entry.startsWith(`${name}=`));

    if (!line) {
      return undefined;
    }

    return line
      .slice(name.length + 1)
      .trim()
      .replace(/(^"|"$)/g, "");
  } catch {
    return undefined;
  }
}

function getShopifyEnvValue(name: string) {
  return readLocalEnvValue(name) || process.env[name];
}

export async function fetchShopifyNewsArticles() {
  const store = getShopifyEnvValue("NOBL_SHOPIFY_STORE") || "nobltravel";
  const apiVersion =
    getShopifyEnvValue("NOBL_SHOPIFY_API_VERSION") || "2024-10";
  const token = getShopifyEnvValue("NOBL_SHOPIFY_TOKEN");

  if (!token) {
    throw new Error("Missing NOBL_SHOPIFY_TOKEN for Shopify blog lookup.");
  }

  const query = `query NewsArticles($after: String) {
    blogs(first: 5, query: "handle:news") {
      edges {
        node {
          articles(first: 250, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                handle
                body
                summary
                publishedAt
                author { name }
                image { url }
                tags
              }
            }
          }
        }
      }
    }
  }`;

  const articleEdges: ShopifyArticleEdge[] = [];
  let after: string | null = null;
  let hasNextPage = true;

  while (hasNextPage && articleEdges.length < 500) {
    const response = await fetch(
      `https://${store}.myshopify.com/admin/api/${apiVersion}/graphql.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ query, variables: { after } }),
        cache: "no-store",
      },
    );
    const payload = (await response.json()) as ShopifyBlogResponse;

    if (!response.ok || payload.errors?.length) {
      const message = payload.errors?.map((error) => error.message).join("; ");
      throw new Error(
        message || `Shopify blog lookup failed with status ${response.status}.`,
      );
    }

    const articles = payload.data?.blogs?.edges?.[0]?.node.articles;

    if (!articles) {
      break;
    }

    articleEdges.push(...articles.edges);
    after = articles.pageInfo.endCursor ?? null;
    hasNextPage = articles.pageInfo.hasNextPage && Boolean(after);
  }

  return articleEdges.slice(0, 500).map(({ node }): ShopifyArticle => ({
    id: node.id,
    title: node.title,
    handle: node.handle,
    body: stripHtml(node.body ?? ""),
    summary: stripHtml(node.summary ?? ""),
    publishedAt: node.publishedAt ?? null,
    authorName: node.author?.name ?? undefined,
    imageUrl: node.image?.url ?? undefined,
    tags: node.tags ?? [],
    url: `https://${store}.com/blogs/news/${node.handle}`,
  }));
}
