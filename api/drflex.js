// api/drflex.js - WITH BRAVE SEARCH
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
    const BRAVE_API_KEY = process.env.BRAVE_API_KEY; // NEW

    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: 'Missing OpenAI API key' });
    }

    if (!BRAVE_API_KEY) {
      return res.status(500).json({ error: 'Missing Brave API key' });
    }

    const messages = [
      { role: 'system', content: personality || 'You are Dr Flex.' },
      ...(history || []).map(h => ({ role: h.role, content: h.content }))
    ];

    // Call GPT-3.5
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

    // Extract actions from AI response
    const actions = [];
    const regex = /\{\s*"type"\s*:\s*"(request_events|request_learning|add_goals|add_todos)"[\s\S]*?\}/g;

    let match;
    while ((match = regex.exec(raw)) !== null) {
      try {
        actions.push(JSON.parse(match[0]));
      } catch (e) {}
    }

    // Process search requests
    const finalActions = [];
    
    for (const action of actions) {
      // Pass through goals and todos as-is (they work!)
      if (action.type === 'add_goals' || action.type === 'add_todos') {
        finalActions.push(action);
        continue;
      }

      // Handle learning search requests
      if (action.type === 'request_learning') {
        const topics = action.query.topics || [];
        const learningItems = [];

        for (const topic of topics.slice(0, 10)) { // Max 10 topics
          try {
            // Search Brave for learning resources
            const searchQuery = `${topic} tutorial guide article site:psychologytoday.com OR site:hbr.org OR site:medium.com OR site:ted.com`;
            const braveResp = await fetch(
              `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=3`,
              {
                headers: {
                  'Accept': 'application/json',
                  'X-Subscription-Token': BRAVE_API_KEY
                }
              }
            );

            if (braveResp.ok) {
              const braveData = await braveResp.json();
              const results = braveData.web?.results || [];
              
              // Take top result
              if (results.length > 0) {
                learningItems.push({
                  title: results[0].title || topic,
                  url: results[0].url
                });
              }
            }
          } catch (e) {
            console.error('Brave search error for', topic, e);
          }
        }

        if (learningItems.length > 0) {
          finalActions.push({
            type: 'add_learning',
            items: learningItems
          });
        }
        continue;
      }

      // Handle event search requests
      if (action.type === 'request_events') {
        const topics = action.query.topics || [];
        const location = action.query.location || 'London';
        const eventItems = [];

        for (const topic of topics.slice(0, 10)) { // Max 10 topics
          try {
            // Search for events
            const searchQuery = `${topic} events ${location} site:eventbrite.co.uk OR site:meetup.com OR site:dice.fm`;
            const braveResp = await fetch(
              `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=3`,
              {
                headers: {
                  'Accept': 'application/json',
                  'X-Subscription-Token': BRAVE_API_KEY
                }
              }
            );

            if (braveResp.ok) {
              const braveData = await braveResp.json();
              const results = braveData.web?.results || [];
              
              // Take top result
              if (results.length > 0) {
                eventItems.push({
                  title: results[0].title || `${topic} Event`,
                  url: results[0].url,
                  description: results[0].description || `${topic} event in ${location}`
                });
              }
            }
          } catch (e) {
            console.error('Brave search error for event', topic, e);
          }
        }

        if (eventItems.length > 0) {
          finalActions.push({
            type: 'add_events',
            items: eventItems
          });
        }
        continue;
      }
    }

    // Clean reply
    let cleaned = raw;
    actions.forEach(a => {
      cleaned = cleaned.replace(JSON.stringify(a), '');
    });

    return res.status(200).json({ 
      reply: cleaned.trim(), 
      actions: finalActions 
    });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error', details: err.toString() });
  }
}
