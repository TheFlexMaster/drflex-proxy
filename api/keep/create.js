// /api/keep/create.js
// Put this file in: drflex-proxy/api/keep/create.js

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const { title, body } = req.body;

    // Create note in Google Keep
    const response = await fetch(
      'https://keep.googleapis.com/v1/notes',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: title || '',
          body: {
            text: {
              text: body || ''
            }
          }
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error('Google Keep create error:', error);
      return res.status(response.status).json({ 
        error: 'Failed to create note',
        details: error 
      });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (error) {
    console.error('Keep create error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
