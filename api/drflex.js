// api/drflex.js
// Vercel Serverless Function
// - Calls OpenAI for Dr Flex "intent + actions"
// - Expands learning/events actions into REAL URLs via Brave Search
// - Validates URLs (no 404, no junk), returns clean actions to the app

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

// ---------------------- helpers ----------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const k = keyFn(x);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function isProbablyBadUrl(u) {
  if (!u) return true;
  const s = String(u).trim();
  if (!/^https?:\/\//i.test(s)) return true;
  // avoid obvious non-page junk
  if (s.includes("google.com/search")) return true;
  if (s.includes("webcache.googleusercontent")) return true;
  return false;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...options, signal: controller.signal, redirect: "follow" });
    return resp;
  } finally {
    clearTimeout(id);
  }
}

async function urlLooks200(url) {
  // HEAD first, then fallback GET with Range
  try {
    const head = await fetchWithTimeout(url, { method: "HEAD" }, 6000);
    if (head.ok) return true;

    // Some sites block HEAD; try GET Range
    const get = await fetchWithTimeout(
      url,
      { method: "GET", headers: { Range: "bytes=0-0" } },
      7000
    );
    return get.ok;
  } catch {
    return false;
  }
}

function parseLocationFromText(text) {
  // very basic: “in London”, “near Manchester”, etc.
  const t = (text || "").toLowerCase();
  const m = t.match(/\b(in|near)\s+([a-zA-Z\s]{2,40})\b/);
  if (!m) return null;
  return m[2].trim();
}

async function braveSearch(query, count = 10, braveApiKey) {
  const url = `${BRAVE_SEARCH_URL}?q=${encodeURIComponent(query)}&count=${count}&search_lang=en&country=GB&freshness=month`;
  const resp = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": braveApiKey,
      },
    },
    9000
  );

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    throw new Error(`Brave search failed: ${resp.status} ${txt.slice(0, 200)}`);
  }

  const data = await resp.json();
  const results = data?.web?.results || [];
  return results
    .map((r) => ({
      title: r.title || r.profile?.name || "Untitled",
      url: r.url,
      description: r.description || "",
      source: r.profile?.name || "",
    }))
    .filter((x) => !isProbablyBadUrl(x.url));
}

async function buildLearningResources(topics, braveApiKey, targetCount = 20) {
  const queries = [];
  for (const topic of topics) {
    queries.push(`${topic} guide OR tutorial OR "how to"`);
    queries.push(`${topic} short video site:youtube.com`);
    queries.push(`${topic} free course OR free lesson`);
  }

  let raw = [];
  for (const q of queries) {
    try {
      const batch = await braveSearch(q, 8, braveApiKey);
      raw.push(...batch);
      // small pause to be gentle to APIs
      await sleep(150);
      if (raw.length >= targetCount * 2) break;
    } catch {
      // ignore one query failure and continue
    }
  }

  raw = uniqBy(raw, (x) => x.url);

  // Validate URLs until we have enough
  const validated = [];
  for (const item of raw) {
    if (validated.length >= targetCount) break;
    const ok = await urlLooks200(item.url);
    if (!ok) continue;

    // Friendly anchor text
    const title = String(item.title || "").trim().slice(0, 120) || "Learning resource";
    validated.push({
      title,
      url: item.url,
      note: item.description?.slice(0, 140) || "",
    });
  }

  return validated;
}

async function buildEventLinks(topics, location, braveApiKey, targetCount = 20) {
  const loc = location || "London";

  const eventQueries = [];
  for (const topic of topics) {
    // Prefer event sites
    eventQueries.push(`${topic} ${loc} site:eventbrite.co.uk`);
    eventQueries.push(`${topic} ${loc} site:meetup.com`);
    eventQueries.push(`${topic} ${loc} tickets`);
    eventQueries.push(`${topic} ${loc} upcoming event`);
  }

  let raw = [];
  for (const q of eventQueries) {
    try {
      const batch = await braveSearch(q, 8, braveApiKey);
      raw.push(...batch);
      await sleep(150);
      if (raw.length >= targetCount * 3) break;
    } catch {
      // continue
    }
  }

  raw = uniqBy(raw, (x) => x.url);

  const validated = [];
  for (const item of raw) {
    if (validated.length >= targetCount) break;
    const ok = await urlLooks200(item.url);
    if (!ok) continue;

    const title = String(item.title || "").trim().slice(0, 140) || "Event";
    validated.push({
      title,
      url: item.url,
      note: item.description?.slice(0, 160) || "",
      location: loc,
    });
  }

  return validated;
}

// Extract <ACTION>{json}</ACTION> blocks from OpenAI text (same idea as your current setup)
function extractActionsFromText(raw) {
  const actionRegex = /<ACTION>([\s\S]*?)<\/ACTION>/gi;
  const actions = [];
  let match;

  while ((match = actionRegex.exec(raw)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed && parsed.type) actions.push(parsed);
    } catch {
      // ignore
    }
  }

  const cleaned = raw.replace(/<ACTION>[\s\S]*?<\/ACTION>/gi, "").trim();
  return { cleaned, actions };
}

// ---------------------- handler ----------------------
module.exports = async function (req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Not allowed" });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

  if (!OPENAI_API_KEY) return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  if (!BRAVE_API_KEY) return res.status(500).json({ error: "Missing BRAVE_API_KEY" });

  try {
    const { personality, history, meta } = req.body || {};

    const messages = [
      { role: "system", content: personality || "You are helpful." },
      ...(Array.isArray(history) ? history.map((h) => ({ role: h.role, content: h.content })) : []),
    ];

    const aiResp = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        // Upgrade model for better action reliability (still cheap-ish)
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7,
        max_tokens: 1200,
      }),
    });

    if (!aiResp.ok) {
      const err = await aiResp.text().catch(() => "");
      return res.status(500).json({ error: "OpenAI error", details: err.slice(0, 500) });
    }

    const data = await aiResp.json();
    const raw = data?.choices?.[0]?.message?.content || "";

    const { cleaned, actions } = extractActionsFromText(raw);

    // Expand learning/events actions into real URLs
    const expandedActions = [];
    const lastUserMsg =
      [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const locationFromUser = parseLocationFromText(lastUserMsg);
    const locationFromMeta = meta?.location ? String(meta.location) : null;
    const location = locationFromMeta || locationFromUser || "London";

    for (const a of actions) {
      const type = String(a.type || "").toLowerCase();

      if (type === "add_learning") {
        const topics = Array.isArray(a.items) ? a.items.map(String) : [];
        const resources = await buildLearningResources(topics, BRAVE_API_KEY, 20);
        expandedActions.push({
          type: "add_learning",
          topics,
          items: resources, // [{title,url,note}]
        });
        continue;
      }

      if (type === "add_events") {
        const topics = Array.isArray(a.items) ? a.items.map(String) : [];
        const events = await buildEventLinks(topics, location, BRAVE_API_KEY, 20);
        expandedActions.push({
          type: "add_events",
          topics,
          location,
          items: events, // [{title,url,note,location}]
        });
        continue;
      }

      // Pass-through for goals/todos etc
      expandedActions.push(a);
    }

    return res.status(200).json({
      reply: cleaned,
      actions: expandedActions,
    });
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: err.message });
  }
};
