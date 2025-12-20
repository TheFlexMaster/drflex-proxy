// api/drflex.js - Main chat endpoint
module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    console.log('❌ No OpenAI API key');
    return res.status(500).json({ error: 'No API key configured' });
  }

  try {
    const { personality, history } = req.body;

    console.log('📤 Chat request with', history?.length || 0, 'messages');

    const messages = [
      { role: 'system', content: personality || 'You are Dr Flex' },
      ...(history || [])
    ];

    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: messages,
        temperature: 0.9,
        max_tokens: 1000
      })
    });

    if (!aiResponse.ok) {
      const error = await aiResponse.text();
      console.log('❌ OpenAI error:', error);
      return res.status(500).json({ error: 'OpenAI API error' });
    }

    const data = await aiResponse.json();
    const reply = data.choices[0]?.message?.content || '';

    console.log('✅ Reply generated');

    return res.status(200).json({ reply: reply });

  } catch (error) {
    console.log('❌ Server error:', error.message);
    return res.status(500).json({ error: 'Server error', details: error.message });
  }
};
