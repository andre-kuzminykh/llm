const API_BASE = '/api';

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || res.statusText);
  }

  return res.json();
}

// Models
export async function getModels() {
  return request<Array<{ id: string; inputPricePer1M: number; outputPricePer1M: number }>>('/models');
}

// Chats (public / no auth)
export async function createChat(model?: string) {
  return request<{ chatId: string; model: string }>('/web/chats', {
    method: 'POST',
    body: JSON.stringify({ model }),
  });
}

export async function listChats() {
  return request<any[]>('/web/chats');
}

export async function getMessages(chatId: string) {
  return request<any[]>(`/web/chats/${chatId}/messages`);
}

export async function sendMessageStream(
  chatId: string,
  message: string,
  onDelta: (text: string) => void,
  onDone: (data: any) => void,
  onError: (error: string) => void,
) {
  const res = await fetch(`${API_BASE}/web/chats/${chatId}/messages/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    onError(body.message || res.statusText);
    return;
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === 'delta' && event.data.text) {
            onDelta(event.data.text);
          } else if (event.type === 'done') {
            onDone(event.data);
          } else if (event.type === 'error') {
            onError(event.data.message);
          }
        } catch {}
      }
    }
  }
}

export async function sendVoice(chatId: string, audioBlob: Blob) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  const res = await fetch(`${API_BASE}/web/chats/${chatId}/voice`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || res.statusText);
  }

  return res.json();
}
