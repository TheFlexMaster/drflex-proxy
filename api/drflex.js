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

IMPORTANT APP CONTROL INSTRUCTIONS:

You can control the Dr Flex app by adding ACTION commands to your responses.

AVAILABLE ACTIONS:
1. Add a goal: [ACTION:{"type":"ADD_GOAL","text":"goal description"}]
2. Add multiple goals at once: [ACTION:{"type":"ADD_GOAL","text":"goal 1"}][ACTION:{"type":"ADD_GOAL","text":"goal 2"}]
3. Add a todo: [ACTION:{"type":"ADD_TODO","text":"task description"}]
4. Add learning resource: [ACTION:{"type":"ADD_LEARNING","title":"resource name","url":"https://..."}]
5. Add event: [ACTION:{"type":"ADD_EVENT","title":"event name","url":"https://...","description":"details"}]
6. Clear all goals: [ACTION:{"type":"CLEAR_GOALS"}]
7. Clear all todos: [ACTION:{"type":"CLEAR_TODO"}]

WHEN TO USE ACTIONS:
- User says "add X to my goals" → Use ADD_GOAL action
- User lists multiple things to learn → Add multiple ADD_LEARNING actions
- User pastes a list of goals (one per line) → Add each as a separate ADD_GOAL action
- User asks you to find learning resources → Search mentally and add multiple ADD_LEARNING with real URLs

IMPORTANT RULES:
1. ALWAYS add actions AFTER your conversational text
2. You can add MULTIPLE actions in one response
3. For lists, add one action per item
4. When adding learning resources, use real, relevant URLs (coursera, youtube, blogs, etc)
5. Parse multi-line input as separate items

Example response:
"Got it! I've added those 3 goals for you. Let's crush them! [ACTION:{"type":"ADD_GOAL","text":"Learn Python"}][ACTION:{"type":"ADD_GOAL","text":"Build an app"}][ACTION:{"type":"ADD_GOAL","text":"Get fit"}]"`;

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
        max_tokens: 500,
        temperature: 0.8
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
