module.exports = async function (req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Not allowed" });

  const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
  if (!TAVILY_API_KEY) {
    return res.status(500).json({ error: "Missing TAVILY_API_KEY" });
  }

  try {
    const { kind, topics, location } = req.body || {};
    const topicText = Array.isArray(topics) ? topics.join(", ") : "";

    let query = "";

    if (kind === "events") {
      query = `upcoming events in ${location || "London"} about ${topicText}`;
    } else {
      query = `best articles videos blog posts guides about ${topicText}`;
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: "basic",
        max_results: 30
      })
    });

    const data = await response.json();

    const items = (data.results || []).map((x) => ({
      title: x.title,
      url: x.url,
      source: x.url
    }));

    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({
      error: "Server error",
      details: err.message
    });
  }
};
