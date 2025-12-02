// DrFlex.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAT_HISTORY_KEY = 'drflex_chat_history';

const DRFLEX_PERSONALITY = `
You are Dr Flex: motivational, funny, supportive, encouraging, no-bullshit. 
You are a coach, comedian, and best friend all in one. 
Always maintain this personality in your replies. Keep responses under 100 words.
`;

export async function sendToDrFlex(userMessage) {
  try {
    let historyJSON = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
    let history = historyJSON ? JSON.parse(historyJSON) : [];

    history.push({ role: 'user', content: userMessage });

    const requestBody = {
      personality: DRFLEX_PERSONALITY,
      history: history
    };

    console.log('Sending to DrFlex API...');
    
    const response = await fetch('https://drflex-proxy.vercel.app/api/drflex', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('Error response:', errorText);
      throw new Error(`API error: ${response.status}`);
    }

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.log('Non-JSON response:', text);
      throw new Error('Server returned non-JSON response');
    }

    const data = await response.json();
    console.log('Success response:', data);
    
    const reply = data.reply || "Hmm, something went wrong. Try again?";

    history.push({ role: 'assistant', content: reply });
    await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(history));

    return reply;
  } catch (err) {
    console.log('DrFlex error:', err);
    return "Oops, I hit a snag. Try again!";
  }
}

export async function clearChatHistory() {
  await AsyncStorage.removeItem(CHAT_HISTORY_KEY);
}
