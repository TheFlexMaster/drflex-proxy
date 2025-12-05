// /api/drflex.js
export default async function handler(req, res) {
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

    const systemPrompt = `${personality || 'You are helpful.'}

CRITICAL APP CONTROL INSTRUCTIONS - YOU MUST FOLLOW THESE:

You can control the Dr Flex app by adding ACTION commands to your responses.

AVAILABLE ACTIONS:
1. Add a goal: [ACTION:{"type":"ADD_GOAL","text":"goal description"}]
2. Add a todo: [ACTION:{"type":"ADD_TODO","text":"task description"}]
3. Add learning resource: [ACTION:{"type":"ADD_LEARNING","title":"resource name","url":"https://..."}]
4. Add event: [ACTION:{"type":"ADD_EVENT","title":"event name","url":"https://...","description":"details"}]

MANDATORY BEHAVIOR:
- When user asks to populate learning tab: Generate EXACTLY 20 ADD_LEARNING actions with REAL URLs
- When user asks to populate events: Generate EXACTLY 20 ADD_EVENT actions with REAL URLs
- When user lists goals: Generate one ADD_GOAL action for EACH goal
- ALWAYS put actions AFTER your text response
- Use REAL, working URLs (not placeholders)

CRITICAL: If user asks for 20 items, you MUST generate all 20 actions in ONE response.

Example for learning:
"Here are 20 resources! [ACTION:{"type":"ADD_LEARNING","title":"Overcome Self-Doubt","url":"https://www.mindtools.com/blog/overcome-doubt"}][ACTION:{"type":"ADD_LEARNING","title":"Self-Compassion Guide","url":"https://www.psychologytoday.com/blog/self-compassion"}]..." (continue for all 20)

Example for goals:
User: "Improve areas: doubt, self-compassion, preparation"
You: "Got it! Adding those goals now. [ACTION:{"type":"ADD_GOAL","text":"Eliminate doubt"}][ACTION:{"type":"ADD_GOAL","text":"Practice self-compassion"}][ACTION:{"type":"ADD_GOAL","text":"Improve preparation skills"}]"

DO NOT just say you'll add them - you MUST include the [ACTION:...] commands.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.slice(-10)
    ];

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        max_tokens: 2000,
        temperature: 0.7
      })
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      return res.status(500).json({ error: 'OpenAI error', details: errorText });
    }

    const data = await openaiResponse.json();
    const reply = data.choices?.[0]?.message?.content || 'No response';

    return res.status(200).json({ reply });

  } catch (error) {
    return res.status(500).json({ error: 'Server error', message: error.message });
  }
}
