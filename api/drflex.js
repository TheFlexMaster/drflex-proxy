// api/drflex.js - Vercel Serverless Function
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
        temperature: 0.9,  // Higher for more creative/funny responses
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
      // Goals/todos - pass through directly
      if (action.type === 'add_goals' || action.type === 'add_todos') {
        finalActions.push(action);
        continue;
      }

      // Learning - search for REAL URLs from quality content sites
      if (action.type === 'add_learning' && BRAVE_API_KEY) {
        const items = action.items || [];
        const learningItems = [];

        for (const item of items) {
          const topic = typeof item === 'string' ? item : (item.title || 'resource');
          
          try {
            console.log('🔍 Searching learning:', topic);
            
            // Target user's specified sites: Tiny Buddha, Psychology Today, Personality Junkie,
            // Harvard Business Review, Huffington Post, Forbes, Personal Excellence, Psyche.co
            const queries = [
              `${topic} site:tinybuddha.com OR site:psychologytoday.com OR site:personalityjunkie.com`,
              `${topic} site:hbr.org OR site:huffpost.com OR site:forbes.com`,
              `${topic} site:personalexcellence.co OR site:psyche.co`,
              `${topic} article guide`,
              `${topic} personal development`
            ];
            
            let found = false;
            
            for (const query of queries) {
              if (found) break;
              
              const r = await fetch(
                `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
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
                
                // STRICT filtering - NO purchase links
                const goodResults = results.filter(res => {
                  const url = res.url.toLowerCase();
                  const title = (res.title || '').toLowerCase();
                  
                  // Block ALL purchase/commercial sites
                  const blockedSites = [
                    'amazon', 'ebay', 'alibaba', 'walmart', 'etsy', 
                    '/buy', '/shop', '/product', '/cart', '/checkout',
                    'udemy.com/course/', 'skillshare.com/classes'
                  ];
                  if (blockedSites.some(bad => url.includes(bad))) return false;
                  
                  // Block purchase keywords in title
                  if (title.includes('buy') || title.includes('price') || 
                      title.includes('sale') || title.includes('shop')) return false;
                  
                  // Prefer user's specified sites
                  const preferredSites = [
                    'tinybuddha.com', 'psychologytoday.com', 'personalityjunkie.com',
                    'hbr.org', 'huffpost.com', 'forbes.com', 'personalexcellence.co', 
                    'psyche.co'
                  ];
                  if (preferredSites.some(site => url.includes(site))) return true;
                  
                  // Also accept other quality content sites
                  const qualitySites = [
                    'medium.com', 'theguardian.com', 'nytimes.com', 'theatlantic.com',
                    'bbc.co.uk', 'bbc.com', 'ted.com'
                  ];
                  if (qualitySites.some(site => url.includes(site))) return true;
                  
                  // Accept URLs with content indicators
                  const contentIndicators = ['article', 'blog', 'guide'];
                  return contentIndicators.some(ind => url.includes(ind) || title.includes(ind));
                });

                if (goodResults.length > 0) {
                  const best = goodResults[0];
                  learningItems.push({
                    title: best.title || topic,
                    url: best.url
                  });
                  console.log('✓ Found:', best.url);
                  found = true;
                  break;
                }
              }
              
              // Small delay between queries to avoid rate limits
              await new Promise(resolve => setTimeout(resolve, 150));
            }
            
            if (!found) {
              console.log('⚠️ No good URL found for:', topic);
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

      // Events - search for REAL event URLs (location is dynamic from user prompt)
      if (action.type === 'add_events' && BRAVE_API_KEY) {
        const items = action.items || [];
        const eventItems = [];

        for (const item of items) {
          const topic = typeof item === 'string' ? item : (item.title || 'event');
          const location = item.location || 'London'; // Default to London if not specified
          
          try {
            console.log('🎉 Searching event:', topic, 'in', location);
            
            // Get current year for future events only
            const currentYear = new Date().getFullYear();
            const nextYear = currentYear + 1;
            
            // Target user's specified event sites: Meetup, Eventbrite, Skiddle, Dice.fm,
            // Fever, Time Out, Londonist, Ticketmaster
            const queries = [
              `${topic} events ${location} ${currentYear} ${nextYear} site:eventbrite.co.uk OR site:eventbrite.com`,
              `${topic} ${location} site:meetup.com`,
              `${topic} events ${location} site:skiddle.com OR site:dice.fm`,
              `${topic} ${location} site:feverup.com OR site:timeout.com`,
              `${topic} ${location} events site:londonist.com OR site:ticketmaster.co.uk`
            ];
            
            let found = false;
            
            for (const query of queries) {
              if (found) break;
              
              const r = await fetch(
                `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`,
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
                
                // Filter for actual event pages from legitimate sites
                const goodResults = results.filter(res => {
                  const url = res.url.toLowerCase();
                  const title = (res.title || '').toLowerCase();
                  
                  // Must be from legitimate event sites
                  const eventSites = [
                    'eventbrite.co.uk', 'eventbrite.com', 'meetup.com', 
                    'skiddle.com', 'dice.fm', 'feverup.com', 'timeout.com',
                    'londonist.com', 'ticketmaster.co.uk', 'ticketmaster.com',
                    'residentadvisor.net', 'designmynight.com'
                  ];
                  const isEventSite = eventSites.some(site => url.includes(site));
                  
                  // Should contain event indicators
                  const eventKeywords = ['event', 'ticket', 'meetup', 'gathering', 'conference', 'workshop', 'festival', 'show', 'gig'];
                  const hasEventKeyword = eventKeywords.some(kw => url.includes(kw) || title.includes(kw));
                  
                  return isEventSite && hasEventKeyword;
                });

                if (goodResults.length > 0) {
                  const best = goodResults[0];
                  eventItems.push({
                    title: best.title || `${topic} Event in ${location}`,
                    url: best.url,
                    description: best.description || ''
                  });
                  console.log('✓ Found:', best.url);
                  found = true;
                  break;
                }
              }
              
              // Small delay between queries
              await new Promise(resolve => setTimeout(resolve, 150));
            }
            
            if (!found) {
              console.log('⚠️ No good event URL found for:', topic);
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

    // Clean reply - remove ACTION tags
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
