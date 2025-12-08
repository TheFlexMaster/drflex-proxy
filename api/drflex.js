// /api/drflex.js (FINAL VERSION — matches your DrFlex.js perfectly)
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { personality, history } = req.body;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing API key" });
    }

    const systemPrompt = personality;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content }))
    ];

    // New OpenAI API endpoint + model
    const aiResp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",      // cheap + fast
        input: messages,
        max_output_tokens: 2000
      })
    });

    const data = await aiResp.json();

    if (!aiResp.ok) {
      return res.status(500).json({
        error: "OpenAI error",
        details: data
      });
    }

    // Extract AI text
    const raw = data.output?.[0]?.content?.[0]?.text || "";

    // Extract actions
    const actions = [];
    const regex = /\[ACTION:(\{.*?})]/g;
    let match;
    while ((match = regex.exec(raw)) !== null) {
      try {
        actions.push(JSON.parse(match[1]));
      } catch {}
    }

    // Remove the action blocks from the human-visible text
    const cleaned = raw.replace(regex, "").trim();

    return res.status(200).json({
      reply: cleaned,
      actions
    });

  } catch (err) {
    return res.status(500).json({
      error: "Server crashed",
      details: err.toString()
    });
  }
}
