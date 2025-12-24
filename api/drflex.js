// /api/resources.js (NEW) — real URLs only via Brave Search + HTTP verify
module.exports = async function (req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Not allowed" });

  const BRAVE_API_KEY = process.env.BRAVE_API_KEY;
  if (!BRAVE_API_KEY) return res.status(500).json({ error: "Missing BRAVE_API_KEY" });

  try {
    const { kind, topics, location } = req.body || {};
    const safeKind = kind === "events" ? "events" : "learning";
    const safeLocation = (location || "London").trim();
    const safeTopics = Array.isArray(topics) ? topics.map(String).slice(0, 6) : [];

    // Build queries
    const baseQuery =
      safeKind === "events"
        ? `${safeLocation} ${safeTopics.join(" ")} event`
        : `${safeTopics.join(" ")} learning resource OR guide OR article OR video`;

    const queries = safeKind === "events"
      ? [
          `${baseQuery} site:eventbrite.com`,
          `${baseQuery} site:meetup.com`,
          `${baseQuery} site:allevents.in`,
          `${baseQuery} site:timeout.com`,
        ]
      : [
          `${baseQuery}`,
          `${safeTopics.join(" ")} best guide`,
          `${safeTopics.join(" ")} short video`,
        ];

    // Search Brave
    const candidates = [];
    for (const q of queries) {
      const braveUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=20`;
      const r = await fetch(braveUrl, {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": BRAVE_API_KEY,
        },
      });

      if (!r.ok) continue;
      const j = await r.json();
      const results = j?.web?.results || [];
      for (const item of results) {
        if (item?.url && item?.title) {
          candidates.push({ title: item.title, url: item.url });
        }
      }
    }

    // Deduplicate
    const seen = new Set();
    const unique = [];
    for (const c of candidates) {
      const u = c.url.split("#")[0];
      if (!seen.has(u)) {
        seen.add(u);
        unique.push({ title: c.title, url: u });
      }
    }

    // Verify reachable (200/301/302/307/308)
    async function isReachable(url) {
      try {
        const head = await fetch(url, { method: "HEAD", redirect: "follow" });
        if ([200, 301, 302, 307, 308].includes(head.status)) return true;
      } catch {}
      try {
        const get = await fetch(url, { method: "GET", redirect: "follow" });
        if ([200, 301, 302, 307, 308].includes(get.status)) return true;
      } catch {}
      return false;
    }

    const verified = [];
    for (const item of unique) {
      if (verified.length >= 25) break; // return a bit more than 20
      const ok = await isReachable(item.url);
      if (ok) verified.push(item);
    }

    // Ensure at least 20 if possible
    const items = verified.slice(0, 25);

    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: err.message });
  }
};
