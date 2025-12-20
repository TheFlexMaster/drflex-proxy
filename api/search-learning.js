// api/search-learning.js - Search for learning resources
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
    const { topics } = req.body;

    if (!topics || !Array.isArray(topics)) {
      return res.status(400).json({ error: 'Invalid topics' });
    }

    console.log('🔍 Searching for', topics.length, 'learning resources');

    const results = [];

    for (const topic of topics) {
      if (results.length >= 20) break; // Limit to 20 total

      try {
        // Target user's specified sites: Tiny Buddha, Psychology Today, etc.
        const queries = [
          `${topic} site:tinybuddha.com OR site:psychologytoday.com OR site:personalityjunkie.com`,
          `${topic} site:hbr.org OR site:huffpost.com OR site:forbes.com`,
          `${topic} site:personalexcellence.co OR site:psyche.co`,
          `${topic} article personal development`
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

              // Filter: NO purchase sites
              const blocked = ['amazon', 'ebay', 'walmart', 'shop', '/buy', '/product', 'udemy.com/course'];
              if (blocked.some(b => url.includes(b))) continue;

              // Filter: Must be from quality sites
              const goodSites = [
                'tinybuddha.com', 'psychologytoday.com', 'personalityjunkie.com',
                'hbr.org', 'huffpost.com', 'forbes.com', 'personalexcellence.co',
                'psyche.co', 'medium.com', 'theguardian.com', 'bbc.co.uk'
              ];

              const isGoodSite = goodSites.some(site => url.includes(site));
              const hasContent = url.includes('article') || url.includes('blog');

              if (isGoodSite || hasContent) {
                results.push({
                  title: title || topic,
                  url: result.url
                });
                found = true;
                break;
              }
            }
          }

          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.log('⚠️ Search error for', topic, ':', error.message);
      }
    }

    console.log('✅ Found', results.length, 'learning URLs');
    return res.status(200).json({ items: results });

  } catch (error) {
    console.log('❌ Error:', error.message);
    return res.status(500).json({ error: 'Search error', items: [] });
  }
};
