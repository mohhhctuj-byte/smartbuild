import { normaliseResearchQuery } from "./workspace";

export type ResearchResult = { title: string; url: string; snippet: string; source: string };

function decodeHtml(value: string) {
  return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, "").trim();
}

function directUrl(rawUrl: string) {
  const decoded = decodeHtml(rawUrl);
  try {
    const parsed = new URL(decoded, "https://duckduckgo.com");
    return parsed.searchParams.get("uddg") || (decoded.startsWith("//") ? `https:${decoded}` : decoded);
  } catch {
    return decoded;
  }
}

export async function researchWeb(rawQuery: unknown): Promise<ResearchResult[]> {
  const query = normaliseResearchQuery(rawQuery);
  if (!query) return [];
  const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, { headers: { "User-Agent": "Mozilla/5.0 SmartBuilderResearch/1.0" }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) return [];
  const html = await response.text();
  const matches = Array.from(html.matchAll(/result__a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?result__snippet[^>]*>([\s\S]*?)<\//g));
  return matches.slice(0, 6).map(match => ({ title: decodeHtml(match[2]), url: directUrl(match[1]), snippet: decodeHtml(match[3]), source: "Web" })).filter(row => row.title && /^https?:\/\//.test(row.url));
}
