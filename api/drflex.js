// api/drflex.js - SAFE VERSION (won't crash)
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

  console.log('=== START ===');
  console.log('Has OpenAI key:', !!OPENAI_API_KEY);
  console.log('Has Brave key:', !!BRAVE_API_KEY);

  if (!OPENAI_API_KEY) {
    console.log('ERROR: No OpenAI key');
    return res.status(500).json({ error: 'Missing OpenAI key' });
  }

  try {
    const { personality, history } = req.body;

    const messages = [
      { role: 'system', content: personality || 'You are Dr Flex.' },
      ...(history || []).map(h => ({ role: h.role, content: h.content }))
    ];

    console.log('Calling OpenAI...');
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
      console.log('OpenAI error:', JSON.stringify(data));
      return res.status(500).json({ error: 'OpenAI error', details: data });
    }

    const raw = data.choices[0]?.message?.content || '';
    console.log('AI response received, length:', raw.length);

    // Extract actions
    const extractedActions = [];
    const lines = raw.split('\n');
    
    for (const line of lines) {
      let trimmed = line.trim().replace(/```json/g, '').replace(/```/g, '').trim();
      
      if (trimmed.startsWith('{') && trimmed.includes('"type"')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed.type) {
            extractedActions.push(parsed);
            console.log('Extracted:', parsed.type);
          }
        } catch (e) {
          console.log('Parse failed:', e.message);
        }
      }
    }

    console.log('Extracted actions:', extractedActions.length);

    // Process actions
    const finalActions = [];
    
    for (const action of extractedActions) {
      try {
        console.log('Processing:', action.type);
        
        // Goals and todos - pass through
        if (action.type === 'add_goals' || action.type === 'add_todos' || action.type === 'add_to_do') {
          if (action.type === 'add_to_do') action.type = 'add_todos';
          finalActions.push(action);
          console.log('Passed through');
          continue;
        }

        // Learning - search Brave
        if (action.type === 'request_learning') {
          console.log('Searching for learning...');
          
          if (!BRAVE_API_KEY) {
            console.log('No Brave key!');
            continue;
          }

          const topics = action.query?.topics || [];
          const learningItems = [];

          for (const topic of topics.slice(0, 10)) {
            try {
              console.log('Searching:', topic);
              const searchQuery = `${topic} guide tutorial`;
              
              const braveResp = await fetch(
                `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=2`,
                {
                  headers: {
                    'Accept': 'application/json',
                    'X-Subscription-Token': BRAVE_API_KEY
                  },
                  signal: AbortSignal.timeout(5000) // 5 second timeout
                }
              );

              if (braveResp.ok) {
                const braveData = await braveResp.json();
                const results = braveData.web?.results || [];
