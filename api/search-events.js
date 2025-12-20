// api/search-events.js - Search for events
module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

  if (!BRAVE_API_KEY) {
    console.log('⚠️ No Brave API key - returning empty results');
    return res.status(200).json({ items: [] });
  }

  try {
    const { events } = req.body;

    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Invalid events format' });
    }

    console.log('🎉 Searching for', events.length, 'events');

    const results = [];
    const currentYear = new Date().getFullYear();
    const nextYear = currentYear + 1;

    for (const event of events) {
      if (results.length >= 20) break; // Limit to 20 total

      const topic = event.topic || 'event';
      const location = event.location || 'London';

      try {
        // Target user's specified sites: Eventbrite, Meetup, Skiddle, etc.
        const queries = [
          `${topic} events ${location} ${currentYear} ${nextYear} site:eventbrite.co.uk OR site:eventbrite.com`,
          `${topic} ${location} site:meetup.com OR site:skiddle.com`,
          `${topic} ${location} site:dice.fm OR site:feverup.com`,
          `${topic} ${location} events site:timeout.com OR site:londonist.com`,
          `${topic} ${location} site:ticketmaster.co.uk`
        ];

        let found = false;

        for (const query of queries) {
          if (found) break;

          const searchResponse = await fetch(
            `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
            {
              headers: {
                'Accept': 'application/json',
                'X-Subscription-Token': BRAVE_API_KEY
              }
            }
          );

          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const webResults = searchData.web?.results || [];

            for (const result of webResults) {
              const url = result.url?.toLowerCase() || '';
              const title = result.title || '';
              const description = result.description || '';

              // Filter: Must be from legitimate event sites
              const eventSites = [
                'eventbrite.co.uk', 'eventbrite.com', 'meetup.com',
                'skiddle.com', 'dice.fm', 'feverup.com', 'timeout.com',
                'londonist.com', 'ticketmaster.co.uk', 'ticketmaster.com',
                'residentadvisor.net', 'designmynight.com'
              ];

              const isEventSite = eventSites.some(site => url.includes(site));

              // Check for event keywords
              const hasEventKeyword = ['event', 'ticket', 'meetup', 'show', 'gig', 'festival']
                .some(kw => url.includes(kw) || title.toLowerCase().includes(kw));

              if (isEventSite && hasEventKeyword) {
                results.push({
                  title: title || `${topic} Event in ${location}`,
                  url: result.url,
                  description: description
                });
                found = true;
                break;
              }
            }
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.log('⚠️ Search error for', topic, 'in', location, ':', error.message);
      }
    }

    console.log('✅ Found', results.length, 'event URLs');
    return res.status(200).json({ items: results });

  } catch (error) {
    console.log('❌ Error:', error.message);
    return res.status(500).json({ error: 'Search error', items: [] });
  }
};
