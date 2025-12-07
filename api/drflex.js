// /api/drflex.js
export default async function handler(req, res) {
  // CORS
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { personality, history } = req.body;

    if (!history || !Array.isArray(history)) {
      return res.status(400).json({ error: 'Invalid history' });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing API key' });
    }

    // ---------------------------
    // AI SYSTEM INSTRUCTIONS
    // ---------------------------
    const systemPrompt = `${personality || 'You are helpful.'}

CRITICAL APP CONTROL INSTRUCTIONS - YOU MUST FOLLOW THESE:

You can control the Dr Flex app by adding ACTION commands to your responses.

AVAILABLE ACTIONS:
1. Add a goal: [ACTION:{"type":"ADD_GOAL","text":"goal description"}]
2. Add a todo: [ACTION:{"type":"ADD_TODO","text":"task description"}]
3. Add learning resource: [ACTION:{"type":"ADD_LEARNING","title":"resource name","url":"https://..."}]
4. Add event: [ACTION:{"type":"ADD_EVENT","title":"event name","url":"https://...","description":"details"}]

MANDATORY RULES:
- When the user wants learning: Generate EXACTLY 20 learning links with real URLs
- When the user wants events: Generate EXACTLY 20 event links with real URLs
- When user sends many goals: Add EACH one separately
- Always place actions AFTER your main text
- Use only real working URLs (blogs, articles, Eventbrite, etc.)

CRITICAL: ALL 20 items must be returned in ONE single message.

NEVER just say "I will add them" — you must output the [ACTION:...] blocks.`;

    // Limit history so the model doesn’t waste tokens
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10)
    ];

    // ---------------------------
    // OPENAI CALL
    // ---------------------------
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',  // cheap model
        messages: messages,
        max_tokens: 600,         // SAFE TOKEN LIMIT
        temperature: 0.7
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      return res.status(500).json({
        error: 'OpenAI error',
        details: errorText
      });
    }

    const data = await openaiResponse.json();
    const reply = data.choices?.[0]?.message?.content || 'No response';

    return res.status(200).json({ reply });

  } catch (error) {
    return res.status(500).json({
      error: 'Server error',
      message: error.message
    });
  }
}
