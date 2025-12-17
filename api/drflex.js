module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Not allowed' });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

  console.log('=== START ===');
  console.log('Has OpenAI:', !!OPENAI_API_KEY);
  console.log('Has Brave:', !!BRAVE_API_KEY);

  if (!OPENAI_API_KEY) return res.status(500).json({ error: 'No OpenAI key' });

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
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    if (!aiResp.ok) {
      const err = await aiResp.json();
      console.log('OpenAI error');
      return res.status(500).json({ error: 'OpenAI error', details: err });
    }

    const data = await aiResp.json();
    const raw = data.choices[0]?.message?.content || '';
    console.log('Got reply');

    // Extract actions from <ACTION> tags
    const actionRegex = /<ACTION>([\s\S]*?)<\/ACTION>/gi;
    const extractedActions = [];
    let match;

    while ((match = actionRegex.exec(raw)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.type) {
          extractedActions.push(parsed);
          console.log('Extracted:', parsed.type);
        }
      } catch (e) {}
    }

    console.log('Total actions:', extractedActions.length);

    // Process actions
    const finalActions = [];

    for (const action of extractedActions) {
      // Goals/todos - pass through
      if (action.type === 'add_goals' || action.type === 'add_todos') {
        finalActions.push(action);
        continue;
      }

      // Learning - search Brave for REAL URLs
      if (action.type === 'add_learning' && BRAVE_API_KEY) {
        const items = action.items || [];
        const learningItems = [];

        for (const item of items) {
          const topic = typeof item === 'string' ? item : (item.title || 'resource');
          
          try {
            console.log('Searching learning:', topic);
            const q = `${topic} tutorial guide -buy -shop -amazon`;
            const r = await fetch(
              `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=3`,
              {
                headers: {
                  'Accept': 'application/json',
                  'X-Subscription-Token': BRAVE_API_KEY
                }
              }
            );

            if (r.ok) {
              const d = await r.json();
              const results = d.web?.results || [];
              
              // Filter out purchase links
              const goodResults = results.filter(res => {
                const url = res.url.toLowerCase();
                return !url.includes('amazon') && 
                       !url.includes('/buy') && 
                       !url.includes('/shop') &&
                       !url.includes('/product');
              });

              if (goodResults[0]?.url) {
                learningItems.push({
                  title: goodResults[0].title || topic,
                  url: goodResults[0].url
                });
                console.log('Found:', goodResults[0].url);
              }
            }
          } catch (e) {
            console.log('Search error:', e.message);
          }
        }

        if (learningItems.length) {
          finalActions.push({ type: 'add_learning', items: learningItems });
        }
        continue;
      }

      // Events - search Brave for REAL event URLs
      if (action.type === 'add_events' && BRAVE_API_KEY) {
        const items = action.items || [];
        const eventItems = [];

        for (const item of items) {
          const topic = typeof item === 'string' ? item : (item.title || 'event');
          const location = item.location || 'London';
          
          try {
            console.log('Searching event:', topic);
            const q = `${topic} events ${location} site:eventbrite.co.uk OR site:meetup.com OR site:dice.fm`;
            const r = await fetch(
              `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=3`,
              {
                headers: {
                  'Accept': 'application/json',
                  'X-Subscription-Token': BRAVE_API_KEY
                }
              }
            );

            if (r.ok) {
              const d = await r.json();
              const results = d.web?.results || [];
              
              if (results[0]?.url) {
                eventItems.push({
                  title: results[0].title || `${topic} Event`,
                  url: results[0].url,
                  description: results[0].description || ''
                });
                console.log('Found:', results[0].url);
              }
            }
          } catch (e) {
            console.log('Search error:', e.message);
          }
        }

        if (eventItems.length) {
          finalActions.push({ type: 'add_events', items: eventItems });
        }
        continue;
      }
    }

    // Clean reply
    let cleaned = raw.replace(/<ACTION>[\s\S]*?<\/ACTION>/gi, '').trim();

    console.log('Returning', finalActions.length, 'actions');
    console.log('=== END ===');

    return res.status(200).json({
      reply: cleaned,
      actions: finalActions
    });

  } catch (err) {
    console.error('ERROR:', err);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};
