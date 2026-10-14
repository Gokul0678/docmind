const API = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const headers = (token) => ({ ...(token && { Authorization: `Bearer ${token}` }) });

export async function api(path, { method = 'GET', body, token, form } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: { ...(!form && { 'Content-Type': 'application/json' }), ...headers(token) },
    body: form || (body && JSON.stringify(body)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.message || 'Request failed'), { status: res.status });
  return data;
}

// Reads the server-sent-events stream of an answer (fetch is used because EventSource cannot POST or send auth headers)
export async function streamAnswer(conversationId, question, token, on) {
  const res = await fetch(`${API}/api/conversations/${conversationId}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers(token) }, body: JSON.stringify({ question }),
  });
  if (!res.ok) { const d = await res.json().catch(() => ({})); throw Object.assign(new Error(d.message || 'Request failed'), { status: res.status }); }
  const reader = res.body.getReader(), decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop();
    for (const block of events) {
      const name = /event: (.+)/.exec(block)?.[1], data = /data: (.+)/.exec(block)?.[1];
      if (name && data) on[name]?.(JSON.parse(data));
    }
  }
}
