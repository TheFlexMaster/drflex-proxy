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
        temperature: 0.9,
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
      // Goals/todos - pass through with IDs
      if (action.type === 'add_goals' || action.type === 'add_todos') {
        const itemsWithIds = (action.items || []).map((item, idx) => ({
          id: Date.now() + idx,
          title: typeof item === 'string' ? item : item.title || item
        }));
        finalActions.push({ type: action.type, items: itemsWithIds });
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
            
            // YOUR SPECIFIED SITES: Tiny Buddha, Psychology Today, Personality Junkie, HBR, Huffington Post, Forbes, Personal Excellence, Psyche.co
            const queries = [
              `${topic} site:tinybuddha.com OR site:psychologytoday.com OR site:personalityjunkie.com`,
              `${topic} site:hbr.org OR site:huffpost.com OR site:forbes.com`,
              `${topic} site:personalexcellence.co OR site:psyche.co`,
              `${topic} personal development article`
            ];
            
            let found = false;
            
            for (const q of queries) {
              if (found) break;
              
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
                
                const goodResults = results.filter(res => {
                  const url = res.url.toLowerCase();
                  
                  // Block purchase sites
                  const blocked = ['amazon', 'ebay', 'alibaba', 'walmart', 'etsy', '/buy', '/shop', '/product', 'udemy.com/course'];
                  if (blocked.some(b => url.includes(b))) return false;
                  
                  // Prefer your specified sites
                  const preferredSites = [
                    'tinybuddha.com', 'psychologytoday.com', 'personalityjunkie.com',
                    'hbr.org', 'huffpost.com', 'forbes.com', 'personalexcellence.co', 'psyche.co'
                  ];
                  if (preferredSites.some(site => url.includes(site))) return true;
                  
                  // Also accept quality sites
                  const qualitySites = ['medium.com', 'theguardian.com', 'bbc.co.uk', 'ted.com'];
                  if (qualitySites.some(site => url.includes(site))) return true;
                  
                  return url.includes('article') || url.includes('blog');
                });

                if (goodResults[0]?.url) {
                  learningItems.push({
                    id: Date.now() + learningItems.length,
                    title: goodResults[0].title || topic,
                    url: goodResults[0].url
                  });
                  console.log('Found:', goodResults[0].url);
                  found = true;
                  break;
                }
              }
              
              await new Promise(resolve => setTimeout(resolve, 100));
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
            console.log('Searching event:', topic, 'in', location);
            
            const currentYear = new Date().getFullYear();
            const nextYear = currentYear + 1;
            
            // YOUR SPECIFIED SITES: Meetup, Eventbrite, Skiddle, Dice.fm, Fever, Time Out, Londonist, Ticketmaster
            const queries = [
              `${topic} events ${location} ${currentYear} ${nextYear} site:eventbrite.co.uk OR site:eventbrite.com`,
              `${topic} ${location} site:meetup.com OR site:skiddle.com`,
              `${topic} ${location} site:dice.fm OR site:feverup.com`,
              `${topic} ${location} events site:timeout.com OR site:londonist.com`,
              `${topic} ${location} site:ticketmaster.co.uk OR site:ticketmaster.com`
            ];
            
            let found = false;
            
            for (const q of queries) {
              if (found) break;
              
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
                
                const goodResults = results.filter(res => {
                  const url = res.url.toLowerCase();
                  
                  // Must be from event sites YOU specified
                  const eventSites = [
                    'eventbrite.co.uk', 'eventbrite.com', 'meetup.com', 'skiddle.com',
                    'dice.fm', 'feverup.com', 'timeout.com', 'londonist.com',
                    'ticketmaster.co.uk', 'ticketmaster.com', 'residentadvisor.net', 'designmynight.com'
                  ];
                  const isEventSite = eventSites.some(site => url.includes(site));
                  
                  const hasEventKeyword = ['event', 'ticket', 'meetup', 'show', 'gig', 'festival'].some(kw => url.includes(kw));
                  
                  return isEventSite && hasEventKeyword;
                });

                if (goodResults[0]?.url) {
                  eventItems.push({
                    id: Date.now() + eventItems.length,
                    title: goodResults[0].title || `${topic} Event in ${location}`,
                    url: goodResults[0].url,
                    description: goodResults[0].description || ''
                  });
                  console.log('Found:', goodResults[0].url);
                  found = true;
                  break;
                }
              }
              
              await new Promise(resolve => setTimeout(resolve, 100));
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
