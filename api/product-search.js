const TAVILY_API_URL = "https://api.tavily.com/search";

const sanitizeText = (value) => {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
};

const parseRequestBody = async (req) => {
  if (!req || typeof req !== "object") return {};
  if (req.body && typeof req.body === "object" && !Array.isArray(req.body)) return req.body;

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  return {};
};

const buildSearchQuery = (productName, brand) => {
  const parts = [brand, productName].map(sanitizeText).filter(Boolean);
  if (!parts.length) return "";
  return parts.join(" ");
};

const extractResults = (body) => {
  if (!body || typeof body !== "object") return [];

  const rawResults = Array.isArray(body.results) ? body.results : [];

  return rawResults
    .map((result) => ({
      title: sanitizeText(result?.title || result?.name || ""),
      description: sanitizeText(result?.content || result?.snippet || result?.description || ""),
      url: sanitizeText(result?.url || ""),
      source: sanitizeText(result?.source || "tavily"),
    }))
    .filter((result) => result.title || result.description || result.url);
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Only POST requests are supported." });
  }

  const body = await parseRequestBody(req);
  const productName = sanitizeText(body.productName || body.name || "");
  const brand = sanitizeText(body.brand || "");
  const query = buildSearchQuery(productName, brand);

  if (!query) {
    return res.status(400).json({ ok: false, error: "A product name is required for web research." });
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      error: "No Tavily API key has been configured on the server. Configure TAVILY_API_KEY in Vercel or local env before enabling live research.",
    });
  }

  try {
    const upstream = await fetch(TAVILY_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 3,
        include_answer: true,
        include_raw_content: false,
      }),
      signal: AbortSignal.timeout(12000),
    });

    if (!upstream.ok) {
      const bodyText = await upstream.text().catch(() => "");
      return res.status(upstream.status).json({
        ok: false,
        error: `Tavily Search request failed (${upstream.status}): ${bodyText || "unknown provider error"}`,
      });
    }

    const upstreamPayload = await upstream.json();
    const results = extractResults(upstreamPayload);
    const firstResult = results[0];
    const answer = sanitizeText(upstreamPayload?.answer || "");

    if (!firstResult && !answer) {
      return res.status(200).json({
        ok: false,
        error: `No results were returned for the requested product: ${query}`,
        results: [],
      });
    }

    const summary = answer || [firstResult?.title, firstResult?.description].filter(Boolean).join(" ").slice(0, 700) || "No summary available.";

    return res.status(200).json({
      ok: true,
      source: firstResult?.source || "tavily",
      summary,
      url: firstResult?.url || "",
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown search provider error";
    return res.status(500).json({
      ok: false,
      error: `Live product research failed: ${message}`,
    });
  }
};
