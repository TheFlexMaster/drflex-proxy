module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  console.log('DrFlex API called');

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      console.log('No API key');
      return res.status(500).json({ error: 'No key' });
    }

    const { personality, history } = req.body;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: personality || 'You are helpful' },
          ...(history || []).map(h => ({ role: h.role, content: h.content }))
        ]
      })
    });

    const data = await response.json();
    const reply = data.choices[0]?.message?.content || 'Error';

    console.log('Returning reply');
    return res.status(200).json({ reply: reply, actions: [] });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message });
  }
};
```

5. **Commit**

### **Step 3: Reimport to Vercel**

1. Go to https://vercel.com/
2. Click **"Add New..."** → **"Project"**
3. **Import** your `drflex-proxy` GitHub repo
4. Click **"Deploy"**
5. **Wait 2 minutes**

### **Step 4: Add Environment Variables**

1. In Vercel project → **Settings** → **Environment Variables**
2. Add `OPENAI_API_KEY` = (your key)
3. Add `BRAVE_API_KEY` = (your Brave key)
4. **Redeploy**

### **Step 5: Test**
```
are you working
