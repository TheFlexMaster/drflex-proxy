module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Not allowed' });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

  console.log('=== API START ===');
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
        temperature: 0.9,
        max_tokens: 1500
      })
    });

    if (!aiResp.ok) {
      console.log('OpenAI error');
      return res.status(500).json({ error: 'OpenAI error' });
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
      // Goals/todos - pass through as PLAIN STRINGS
      if (action.type === 'add_goals' || action.type === 'add_todos') {
        // Keep items as simple strings
        finalActions.push({
          type: action.type,
          items: action.items || []
        });
        continue;
      }

      // Learning - search Brave for REAL URLs
      if (action.type === 'add_learning' && BRAVE_API_KEY) {
        const topics = action.items || [];
        const learningItems = [];

        for (const topic of topics.slice(0, 20)) {
          try {
            console.log('Searching learning:', topic);
            
            // Search with filters for quality sites
            const q = `${topic} tutorial guide article site:psychologytoday.com OR site:tinybuddha.com OR site:hbr.org OR site:medium.com OR site:ted.com -buy -shop -amazon -product`;
            
            const r = await fetch(
              `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`,
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
              
              // Filter for quality, non-purchase sites
              const goodResults = results.filter(res => {
                const url = res.url.toLowerCase();
                const badSites = ['amazon', 'ebay', 'udemy.com/course', '/buy', '/shop', '/product'];
                return !badSites.some(bad => url.includes(bad));
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
        const topics = action.items || [];
        const eventItems = [];

        for (const topic of topics.slice(0, 20)) {
          try {
            console.log('Searching event:', topic);
            
            const q = `${topic} events London 2025 2026 site:eventbrite.co.uk OR site:meetup.com OR site:dice.fm OR site:skiddle.com OR site:timeout.com`;
            
            const r = await fetch(
              `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=5`,
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
              
              // Filter for real event sites
              const eventSites = ['eventbrite', 'meetup.com', 'dice.fm', 'skiddle.com', 'timeout.com', 'ticketmaster'];
              const goodResults = results.filter(res => {
                const url = res.url.toLowerCase();
                return eventSites.some(site => url.includes(site)) && 
                       (url.includes('event') || url.includes('ticket') || url.includes('meetup'));
              });

              if (goodResults[0]?.url) {
                eventItems.push({
                  id: Date.now() + eventItems.length,
                  title: goodResults[0].title || `${topic} Event`,
                  url: goodResults[0].url,
                  description: goodResults[0].description || ''
                });
                console.log('Found:', goodResults[0].url);
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

    // Clean reply - remove action blocks
    let cleaned = raw.replace(/<ACTION>[\s\S]*?<\/ACTION>/gi, '').trim();

    console.log('Returning', finalActions.length, 'actions');
    console.log('=== API END ===');

    return res.status(200).json({
      reply: cleaned,
      actions: finalActions
    });

  } catch (err) {
    console.error('ERROR:', err);
    return res.status(500).json({ error: 'Error', details: err.message });
  }
};
```

---

## 🚀 **SETUP (5 minutes):**

1. **Replace DrFlex.js** with FILE 1 above
2. **Replace api/drflex.js on GitHub** with FILE 2 above
3. **Commit to GitHub** and wait 1 minute for Vercel to deploy
4. **Restart Expo:** `npx expo start -c`

---

## 🧪 **TEST:**
```
Add goals: test goal 1, test goal 2
```

**Should:**
- ✅ Dr Flex replies with funny message
- ✅ NO code visible in chat
- ✅ 2 goals appear in Goals tab
```
Add learning about emotional intelligence
