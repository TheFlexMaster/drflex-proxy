// /api/drflex.js (UPDATED FOR NEW OPENAI API)
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

    const systemPrompt = `${personality}

You output ACTION commands like:

[ACTION:{"type":"ADD_GOAL","text":"..."}]

RULES:
• When user sends multiple goals, add EACH one separately  
• When user requests events/learning: ALWAYS output EXACTLY 20 items  
• Use REAL URLs only  
• Always return actions AFTER your text`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...history.map(h => ({ role: h.role, content: h.content }))
    ];

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: messages,
        max_output_tokens: 2000
      }),
    });

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      return res.status(500).json({
        error: "OpenAI failed",
        details: data
      });
    }

    const raw = data.output?.[0]?.content?.[0]?.text || "";

    // Extract actions
    const actions = [];
    const regex = /\[ACTION:(\{.*?\})\]/g;
    let match;

    while ((match = regex.exec(raw)) !== null) {
      try {
        actions.push(JSON.parse(match[1]));
      } catch {}
    }

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
