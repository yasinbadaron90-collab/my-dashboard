// Cloudflare Worker — Anthropic API proxy for My Dashboard Odin Chat
// Deploy at: https://dash.cloudflare.com → Workers & Pages → Create Worker
// Paste this code, deploy, then copy the worker URL into odin_chat.js

export default {
  async fetch(request, env) {
    // Only allow POST
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Get API key from request header (sent by the app)
    const apiKey = request.headers.get('X-Api-Key');
    if (!apiKey || !apiKey.startsWith('sk-ant-')) {
      return new Response(JSON.stringify({ error: { message: 'Invalid or missing API key' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Forward body to Anthropic
    let body;
    try { body = await request.json(); } catch(e) {
      return new Response(JSON.stringify({ error: { message: 'Invalid JSON body' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body)
    });

    const data = await anthropicRes.json();

    return new Response(JSON.stringify(data), {
      status: anthropicRes.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
};
