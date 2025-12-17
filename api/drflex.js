// api/drflex.js - COMPLETE WITH BRAVE SEARCH
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
    const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

    console.log('=== VERCEL API START ===');
    console.log('Has OpenAI key:', !!OPENAI_API_KEY);
    console.log('Has Brave key:', !!BRAVE_API_KEY);

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing OpenAI API key' });
    }

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
      console.log('OpenAI error:', data);
      return res.status(500).json({ error: 'OpenAI error', details: data });
    }

    const raw = data.choices[0]?.message?.content || '';
    console.log('AI Response length:', raw.length);

    // Extract actions - be more lenient with parsing
    const extractedActions = [];
    
    // Split by lines and look for JSON
    const lines = raw.split('\n');
