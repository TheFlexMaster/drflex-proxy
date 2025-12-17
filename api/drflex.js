export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Not allowed' });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

  console.log('START - Has keys:', !!OPENAI_API_KEY, !!BRAVE_API_KEY);

  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'No OpenAI key' });

  try {
    const { personality, history } = req.body;

    const messages = [
      { role: 'system', content: personality || 'You are helpful.' },
      ...(history || []).map(h => ({ role: h.role, content: h.content }))
    ];

    console.log('Calling OpenAI');
    const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.7
      })
    });

    const data = await aiResp.json();
    if (!aiResp.ok) {
      console.log('OpenAI failed');
      return res.status(500).json({ error: 'OpenAI error' });
    }

    const raw = data.choices[0]?.message?.content || '';
    console.log('Got reply');

    // Extract actions
    const actions = [];
    const lines = raw.split('\n');
    
    for (const line of lines) {
      const clean = line.trim().replace(/```json/g, '').replace(/```/g, '').trim();
      
      if (clean.startsWith('{') && clean.includes('"type"')) {
        try {
          const parsed = JSON.parse(clean);
          if (parsed.type) actions.push(parsed);
        } catch (e) {}
      }
    }

    console.log('Actions:', actions.length);

    // Process
    const final = [];
    
    for (const act of actions) {
      // Goals/todos - pass through
      if (act.type === 'add_goals' || act.type === 'add_todos' || act.type === 'add_to_do') {
        if (act.type === 'add_to_do') act.type = 'add_todos';
        final.push(act);
        continue;
      }

      // Learning
      if (act.type === 'request_learning' && BRAVE_API_KEY) {
        const topics = act.query?.topics || [];
        const items = [];

        for (const topic of topics.slice(0, 5)) {
          try {
            const r = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(topic + ' tutorial')}&count=1`, {
              headers: { 'Accept': 'application
