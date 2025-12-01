// /api/calendar/events.js
// Put this file in: drflex-proxy/api/calendar/events.js

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    // Fetch from Google Calendar API
    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events?' + 
      new URLSearchParams({
        maxResults: '20',
        orderBy: 'startTime',
        singleEvents: 'true',
        timeMin: new Date().toISOString(),
      }),
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Google Calendar API error:', error);
      return res.status(response.status).json({ 
        error: 'Failed to fetch events',
        details: error 
      });
    }

    const data = await response.json();
    return res.status(200).json({ events: data.items || [] });

  } catch (error) {
    console.error('Calendar events error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
