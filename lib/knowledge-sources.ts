"use server";

/**
 * Pluggable knowledge source layer.
 * Fetches content from free, reliable external APIs for category topics.
 */

export interface KnowledgeItem {
    title: string;
    summary: string;
    url: string;
    source: "wikipedia" | "devto" | "hackernews";
    publishedAt?: string;
    imageUrl?: string;
    tags?: string[];
}

export interface WikiSummary {
    title: string;
    extract: string;
    thumbnail?: { source: string };
    content_urls?: { desktop: { page: string } };
}

// ─── Wikipedia ───────────────────────────────────────────────────────

export async function fetchWikipediaSummary(topic: string): Promise<KnowledgeItem | null> {
    try {
        // Try the topic as-is first, then with underscores
        const encoded = encodeURIComponent(topic.replace(/ /g, "_"));
        const res = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
            { next: { revalidate: 3600 } } // cache for 1 hour
        );

        if (!res.ok) {
            // Try a search instead
            const searchRes = await fetch(
                `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(topic)}&limit=1&format=json`
            );
            if (!searchRes.ok) return null;
            const searchData = await searchRes.json();
            if (!searchData[1]?.length) return null;

            // Fetch the summary for the first search result
            const matchTitle = searchData[1][0].replace(/ /g, "_");
            const retryRes = await fetch(
                `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(matchTitle)}`
            );
            if (!retryRes.ok) return null;
            const data: WikiSummary = await retryRes.json();
            return {
                title: data.title,
                summary: data.extract,
                url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${matchTitle}`,
                source: "wikipedia",
                imageUrl: data.thumbnail?.source,
            };
        }

        const data: WikiSummary = await res.json();
        return {
            title: data.title,
            summary: data.extract,
            url: data.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${encoded}`,
            source: "wikipedia",
            imageUrl: data.thumbnail?.source,
        };
    } catch (e) {
        console.error("[Wikipedia] Failed to fetch for topic:", topic, e);
        return null;
    }
}

// ─── Wikipedia Full Article ──────────────────────────────────────────

export interface WikiFullArticle {
    title: string;
    summary: string;      // first paragraph
    fullContent: string;  // full plain-text article
    url: string;
    imageUrl?: string;
    lastRevision?: string;
}

export async function fetchWikipediaFullArticle(topic: string): Promise<WikiFullArticle | null> {
    try {
        const encoded = encodeURIComponent(topic.replace(/ /g, "_"));

        // First, resolve the correct title via summary API (handles redirects)
        let resolvedTitle = topic.replace(/ /g, "_");
        let summaryUrl = "";
        let thumbnailUrl: string | undefined;

        const summaryRes = await fetch(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`
        );
        if (summaryRes.ok) {
            const sumData = await summaryRes.json();
            resolvedTitle = sumData.title?.replace(/ /g, "_") || resolvedTitle;
            summaryUrl = sumData.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${resolvedTitle}`;
            thumbnailUrl = sumData.thumbnail?.source;
        } else {
            // Fallback: search for the topic
            const searchRes = await fetch(
                `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(topic)}&limit=1&format=json`
            );
            if (!searchRes.ok) return null;
            const searchData = await searchRes.json();
            if (!searchData[1]?.length) return null;
            resolvedTitle = searchData[1][0].replace(/ /g, "_");
            summaryUrl = `https://en.wikipedia.org/wiki/${resolvedTitle}`;
        }

        // Fetch the full article text via the Action API
        const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(resolvedTitle)}&prop=extracts|pageimages|revisions&explaintext=true&exsectionformat=plain&piprop=thumbnail&pithumbsize=300&rvprop=timestamp&rvlimit=1&format=json`;
        const res = await fetch(apiUrl);
        if (!res.ok) return null;

        const data = await res.json();
        const pages = data.query?.pages;
        if (!pages) return null;

        const pageId = Object.keys(pages)[0];
        if (pageId === "-1") return null; // Page not found

        const page = pages[pageId];
        const fullText: string = page.extract || "";
        const lastRevision = page.revisions?.[0]?.timestamp;

        // Extract first paragraph as summary
        const firstParagraph = fullText.split("\n\n")[0] || fullText.substring(0, 500);

        // Use thumbnail from Action API if not already found
        if (!thumbnailUrl && page.thumbnail?.source) {
            thumbnailUrl = page.thumbnail.source;
        }

        return {
            title: page.title || resolvedTitle.replace(/_/g, " "),
            summary: firstParagraph,
            fullContent: fullText,
            url: summaryUrl || `https://en.wikipedia.org/wiki/${resolvedTitle}`,
            imageUrl: thumbnailUrl,
            lastRevision,
        };
    } catch (e) {
        console.error("[Wikipedia] Failed to fetch full article for topic:", topic, e);
        return null;
    }
}

// ─── DEV.to ──────────────────────────────────────────────────────────

export async function fetchDevToArticles(topic: string, limit = 5): Promise<KnowledgeItem[]> {
    try {
        // Map common category names to better DEV.to tags
        const tagMap: Record<string, string> = {
            "Cloud Architecture": "cloud",
            "AI & Machine Learning": "machinelearning",
            "Cybersecurity": "security",
            "DevOps & CI/CD": "devops",
            "Software Development": "programming",
            "Data Engineering": "dataengineering",
            "Business Intelligence": "analytics",
            "Blockchain & Web3": "blockchain",
            "UX & Product Design": "ux",
            "Containers & Kubernetes": "kubernetes",
            "Infrastructure as Code": "terraform",
            "Generative AI": "ai",
            "LLMs & NLP": "llm",
            "MLOps": "mlops",
        };

        const tag = tagMap[topic] || topic.toLowerCase().replace(/[^a-z0-9]/g, "");
        const res = await fetch(
            `https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&per_page=${limit}&top=7`,
            { next: { revalidate: 1800 } } // cache for 30 min
        );

        if (!res.ok) return [];

        const articles = await res.json();
        return articles.map((a: any) => ({
            title: a.title,
            summary: a.description || "",
            url: a.url,
            source: "devto" as const,
            publishedAt: a.published_at,
            imageUrl: a.cover_image || a.social_image,
            tags: a.tag_list || [],
        }));
    } catch (e) {
        console.error("[DEV.to] Failed to fetch for topic:", topic, e);
        return [];
    }
}

// ─── Hacker News (via Algolia) ───────────────────────────────────────

export async function fetchHackerNewsStories(topic: string, limit = 5): Promise<KnowledgeItem[]> {
    try {
        const res = await fetch(
            `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(topic)}&tags=story&hitsPerPage=${limit}`,
            { next: { revalidate: 1800 } }
        );

        if (!res.ok) return [];

        const data = await res.json();
        return (data.hits || []).map((hit: any) => ({
            title: hit.title,
            summary: `${hit.points || 0} points · ${hit.num_comments || 0} comments`,
            url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
            source: "hackernews" as const,
            publishedAt: hit.created_at,
        }));
    } catch (e) {
        console.error("[HackerNews] Failed to fetch for topic:", topic, e);
        return [];
    }
}

// ─── Aggregated fetch ────────────────────────────────────────────────

export interface CategoryKnowledge {
    wikipedia: KnowledgeItem | null;
    articles: KnowledgeItem[];
    discussions: KnowledgeItem[];
}

export async function fetchCategoryKnowledge(categoryTitle: string): Promise<CategoryKnowledge> {
    const [wikipedia, articles, discussions] = await Promise.all([
        fetchWikipediaSummary(categoryTitle),
        fetchDevToArticles(categoryTitle),
        fetchHackerNewsStories(categoryTitle),
    ]);

    return { wikipedia, articles, discussions };
}
