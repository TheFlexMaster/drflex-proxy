module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

  console.log('=== API CALLED ===');
  console.log('Has OpenAI key:', !!OPENAI_API_KEY);
  console.log('Has Brave key:', !!BRAVE_API_KEY);

  if (!OPENAI_API_KEY) {
    console.log('ERROR: No OpenAI key');
    return res.status(500).json({ error: 'Missing OpenAI API key' });
  }

  try {
    const body = req.body || {};
    const personality = body.personality || 'You are helpful';
    const history = body.history || [];

    console.log('Building messages');
    const messages = [
      { role: 'system', content: personality },
      ...history.map(h => ({ role: h.role, content: h.content }))
    ];

    console.log('Calling OpenAI');
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: messages,
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      console.log('OpenAI error:', JSON.stringify(errorData));
      return res.status(500).json({ error: 'OpenAI API error', details: errorData });
    }

    const openaiData = await openaiResponse.json();
    const aiReply = openaiData.choices[0]?.message?.content || '';

    console.log('Got reply from OpenAI, length:', aiReply.length);

    // Extract actions from reply
    const extractedActions = [];
    const lines = aiReply.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      // Remove markdown code blocks
      line = line.replace(/```json/g, '').replace(/```/g, '').trim();
      
      if (line.startsWith('{') && line.includes('"type"')) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type) {
            extractedActions.push(parsed);
            console.log('Extracted action:', parsed.type);
          }
        } catch (e) {
          console.log('Failed to parse JSON from line:', line.substring(0, 50));
        }
      }
    }

    console.log('Total extracted actions:', extractedActions.length);

    // Process actions
    const finalActions = [];

    for (let i = 0; i < extractedActions.length; i++) {
      const action = extractedActions[i];
      console.log('Processing action:', action.type);

      // Pass through goals and todos unchanged
      if (action.type === 'add_goals' || action.type === 'add_todos' || action.type === 'add_to_do') {
        // Normalize add_to_do to add_todos
        if (action.type === 'add_to_do') {
          action.type = 'add_todos';
        }
        finalActions.push(action);
        console.log('Passed through:', action.type);
        continue;
      }

      // Handle learning requests
      if (action.type === 'request_learning') {
        console.log('Processing request_learning');
        
        if (!BRAVE_API_KEY) {
          console.log('No Brave API key - skipping search');
          continue;
        }

        const topics = action.query?.topics || [];
        console.log('Topics to search:', topics.length);
        
        const learningItems = [];

        for (let j = 0; j < Math.min(topics.length, 10); j++) {
          const topic = topics[j];
          try {
            console.log('Searching Brave for:', topic);
            const searchQuery = topic + ' tutorial guide';
            const braveUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=2`;
            
            const braveResponse = await fetch(braveUrl, {
              headers: {
                'Accept': 'application/json',
                'X-Subscription-Token': BRAVE_API_KEY
              }
            });

            if (braveResponse.ok) {
              const braveData = await braveResponse.json();
              const results = braveData.web?.results || [];
              console.log('Brave returned:', results.length, 'results for', topic);
              
              if (results.length > 0 && results[0].url) {
                learningItems.push({
                  title: results[0].title || topic,
                  url: results[0].url
                });
                console.log('Added learning item:', results[0].url);
              }
            } else {
              console.log('Brave API failed with status:', braveResponse.status);
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
          console.log('Added add_learning action');
        }
        continue;
      }

      // Handle event requests
      if (action.type === 'request_events') {
        console.log('Processing request_events');
        
        if (!BRAVE_API_KEY) {
          console.log('No Brave API key - skipping search');
          continue;
        }

        const topics = action.query?.topics || [];
        const location = action.query?.location || 'London';
        console.log('Event topics:', topics.length, 'Location:', location);
        
        const eventItems = [];

        for (let j = 0; j < Math.min(topics.length, 10); j++) {
          const topic = topics[j];
          try {
            console.log('Searching Brave for event:', topic);
            const searchQuery = topic + ' events ' + location;
            const braveUrl = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(searchQuery)}&count=2`;
            
            const braveResponse = await fetch(braveUrl, {
              headers: {
                'Accept': 'application/json',
                'X-Subscription-Token': BRAVE_API_KEY
              }
            });

            if (braveResponse.ok) {
              const braveData = await braveResponse.json();
              const results = braveData.web?.results || [];
              console.log('Brave returned:', results.length, 'results for', topic);
              
              if (results.length > 0 && results[0].url) {
                eventItems.push({
                  title: results[0].title || (topic + ' Event'),
                  url: results[0].url,
                  description: results[0].description || ''
                });
                console.log('Added event:', results[0].url);
              }
            } else {
              console.log('Brave API failed with status:', braveResponse.status);
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
          console.log('Added add_events action');
        }
        continue;
      }
    }

    // Clean the reply text
    let cleanedReply = aiReply;
    for (let i = 0; i < extractedActions.length; i++) {
      try {
        const jsonStr = JSON.stringify(extractedActions[i]);
        cleanedReply = cleanedReply.replace(jsonStr, '');
      } catch (e) {
        // Ignore
      }
    }
    cleanedReply = cleanedReply.replace(/```json/g, '').replace(/```/g, '').trim();

    console.log('Final actions to return:', finalActions.length);
    console.log('=== API END ===');

    return res.status(200).json({
      reply: cleanedReply,
      actions: finalActions
    });

  } catch (error) {
    console.error('=== FATAL ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    return res.status(500).json({ 
      error: 'Server error',
      details: error.message
    });
  }
};
