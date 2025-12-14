# drflex.js (FULL REPLACEMENT)

```js
// DrFlex.js – PRODUCTION VERSION (No hallucinated URLs)
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAT_HISTORY_KEY = 'drflex_chat_history';

const DRFLEX_PERSONALITY = `You are Dr Flex – a motivating, practical coach.

CRITICAL OUTPUT RULES:
- When the user asks to add items, you MUST respond with JSON at the END of your message.
- Never invent URLs.
- Never guess links.
- URLs may ONLY come from tool results.
- If real URLs are not available, request them instead.

MAX ITEMS:
- Never add more than 20 items.

EVENTS:
When the user asks to add events:
- Do NOT generate URLs
- Do NOT generate fake events
- Events must be future-dated only

Format:
{"type":"request_events","query":{"topics":[],"location":""}}

LEARNING:
When the user asks to add learning resources:
- Do NOT generate URLs
- Do NOT generate Google search links

Format:
{"type":"request_learning","query":{"topics":[]}}

RULES:
- Topics and location ALWAYS come from the user
- You only request data, never fabricate it
- Keep replies short
`;

async function loadHistory() {
  const raw = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
  return raw ? JSON.parse(raw).slice(-8) : [];
}

function extractActionsFromText(text) {
  const actions = [];
  const regex = /\{\s*"type"\s*:\s*"(request_events|request_learning|add_events|add_learning|add_goals|add_todos)"[\s\S]*?\}/g;

  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[0]);
      actions.push(parsed);
    } catch (e) {}
  }
  return actions;
}

function cleanReplyText(text, actions) {
  let cleaned = text;
  actions.forEach(a => {
    cleaned = cleaned.replace(JSON.stringify(a), '');
  });
  return cleaned.trim();
}

export async function sendToDrFlexWithActions(userMessage) {
  try {
    const history = await loadHistory();
    history.push({ role: 'user', content: userMessage });

    const res = await fetch('https://drflex-proxy.vercel.app/api/drflex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personality: DRFLEX_PERSONALITY, history })
    });

    const json = await res.json();

    let replyText = json.reply || '';
    let actions = json.actions && json.actions.length
      ? json.actions
      : extractActionsFromText(replyText);

    const cleanReply = cleanReplyText(replyText, actions);

    history.push({ role: 'assistant', content: cleanReply });
    await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));

    return { reply: cleanReply, actions };
  } catch (e) {
    return { reply: 'Error. Try again.', actions: [] };
  }
}

export async function sendToDrFlex(msg) {
  const r = await sendToDrFlexWithActions(msg);
  return r.reply;
}

export async function clearChatHistory() {
  await AsyncStorage.removeItem(CHAT_HISTORY_KEY);
}
```

---

# api/drflex.js (FULL REPLACEMENT – VERCEL)

```js
// api/drflex.js – GPT‑3.5 SAFE ACTION VERSION
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { personality, history } = req.body;
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing API key' });
    }

    const messages = [
      { role: 'system', content: personality || 'You are Dr Flex.' },
      ...(history || []).map(h => ({ role: h.role, content: h.content }))
    ];

    const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    const data = await aiResp.json();
    if (!aiResp.ok) {
      return res.status(500).json({ error: 'OpenAI error', details: data });
    }

    const raw = data.choices[0]?.message?.content || '';

    const actions = [];
    const regex = /\{\s*"type"\s*:\s*"(request_events|request_learning|add_events|add_learning|add_goals|add_todos)"[\s\S]*?\}/g;

    let match;
    while ((match = regex.exec(raw)) !== null) {
      try {
        actions.push(JSON.parse(match[0]));
      } catch (e) {}
    }

    let cleaned = raw;
    actions.forEach(a => {
      cleaned = cleaned.replace(JSON.stringify(a), '');
    });

    return res.status(200).json({ reply: cleaned.trim(), actions });

  } catch (err) {
    return res.status(500).json({ error: 'Server error', details: err.toString() });
  }
}
```
