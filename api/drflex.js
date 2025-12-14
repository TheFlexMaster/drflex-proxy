// api/drflex.js - COMPLETE WITH BRAVE SEARCH AND LOGGING
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

    // Call GPT-3.5
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
    console.log('AI Response:', raw.substring(0, 200));

    // Extract actions from AI response
    const extractedActions = [];
    const regex = /\{"type"\s*:\s*"(request_events|request_learning|add_goals|add_todos)"\s*,[\s\S]*?\}/g;
    let match;

    while ((match = regex.exec(raw)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);
        extractedActions.push(parsed);
        console.log('Extracted action:', parsed.type);
      } catch (e) {
        console.log('Parse error:', e.message);
      }
    }

    console.log('Total extracted actions:', extractedActions.length);

    // Process actions
    const finalActions = [];
    
    for (const action of extractedActions) {
      console.log('Processing action:', action.type);
      
      // Pass through goals and todos unchanged
      if (action.type === 'add_goals' || action.type === 'add_todos') {
        console.log('Passing through:', action.type);
        finalActions.push(action);
        continue;
      }

      // Handle learning search requests
      if (action.type === 'request_learning') {
        console.log('Processing request_learning');
        const topics = action.query?.topics || [];
        console.log('Topics:', topics.length);
        
        if (!BRAVE_API_KEY) {
          console.log('NO BRAVE KEY - cannot search');
          continue;
        }

        const learningItems = [];

        for (const topic of topics.slice(0, 10)) {
          try {
            console.log('Searching Brave for:', topic);
            const searchQuery = `${topic} guide tutorial free resources`;
            const braveResp = await fetch(
              `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=2`,
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
              console.log('Brave returned:', results.length, 'results');
              
              if (results.length > 0) {
                learningItems.push({
                  title: results[0].title || topic,
                  url: results[0].url
                });
                console.log('Added learning item:', results[0].url);
              }
            } else {
              console.log('Brave search failed:', braveResp.status);
            }
          } catch (e) {
            console.log('Brave search error for', topic, ':', e.message);
          }
        }

        console.log('Total learning items found:', learningItems.length);
        
        if (learningItems.length > 0) {
          finalActions.push({
            type: 'add_learning',
            items: learningItems
          });
          console.log('Added add_learning action with', learningItems.length, 'items');
        }
        continue;
      }

      // Handle event search requests
      if (action.type === 'request_events') {
        console.log('Processing request_events');
        const topics = action.query?.topics || [];
        const location = action.query?.location || 'London';
        console.log('Topics:', topics.length, 'Location:', location);
        
        if (!BRAVE_API_KEY) {
          console.log('NO BRAVE KEY - cannot search');
          continue;
        }

        const eventItems = [];

        for (const topic of topics.slice(0, 10)) {
          try {
            console.log('Searching Brave for event:', topic);
            const searchQuery = `${topic} events ${location} site:eventbrite.co.uk OR site:meetup.com`;
            const braveResp = await fetch(
              `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=2`,
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
              console.log('Brave returned:', results.length, 'results');
              
              if (results.length > 0) {
                eventItems.push({
                  title: results[0].title || `${topic} Event`,
                  url: results[0].url,
                  description: results[0].description || `${topic} in ${location}`
                });
                console.log('Added event item:', results[0].url);
              }
            } else {
              console.log('Brave search failed:', braveResp.status);
            }
          } catch (e) {
            console.log('Brave search error for', topic, ':', e.message);
          }
        }

        console.log('Total event items found:', eventItems.length);
        
        if (eventItems.length > 0) {
          finalActions.push({
            type: 'add_events',
            items: eventItems
          });
          console.log('Added add_events action with', eventItems.length, 'items');
        }
        continue;
      }
    }

    // Clean reply
    let cleaned = raw;
    extractedActions.forEach(a => {
      cleaned = cleaned.replace(JSON.stringify(a), '');
    });
    cleaned = cleaned.trim();

    console.log('Final actions to return:', finalActions.length);
    console.log('=== VERCEL API END ===');

    return res.status(200).json({ 
      reply: cleaned, 
      actions: finalActions 
    });

  } catch (err) {
    console.error('VERCEL ERROR:', err);
    return res.status(500).json({ error: 'Server error', details: err.toString() });
  }
}
