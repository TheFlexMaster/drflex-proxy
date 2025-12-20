module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Not allowed' });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  console.log('API called');

  if (!OPENAI_API_KEY) {
    console.log('No OpenAI key');
    return res.status(500).json({ error: 'No key' });
  }

  try {
    const { personality, history } = req.body;

    const messages = [
      { role: 'system', content: personality || 'You are helpful' },
      ...(history || []).map(h => ({ role: h.role, content: h.content }))
    ];

    console.log('Calling OpenAI');
    
    const aiResp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.9,
        max_tokens: 1500
      })
    });

    if (!aiResp.ok) {
      console.log('OpenAI failed');
      const err = await aiResp.json();
      return res.status(500).json({ error: 'OpenAI error', details: err });
    }

    const data = await aiResp.json();
    const raw = data.choices[0]?.message?.content || '';

    console.log('Got reply');

    const actionRegex = /<ACTION>([\s\S]*?)<\/ACTION>/gi;
    const actions = [];
    let match;

    while ((match = actionRegex.exec(raw)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.type) {
          actions.push(parsed);
          console.log('Found action:', parsed.type);
        }
      } catch (e) {
        console.log('Parse error');
      }
    }

    const cleaned = raw.replace(/<ACTION>[\s\S]*?<\/ACTION>/gi, '').trim();

    console.log('Returning', actions.length, 'actions');

    return res.status(200).json({
      reply: cleaned,
      actions: actions
    });

  } catch (err) {
    console.error('ERROR:', err.message);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};
