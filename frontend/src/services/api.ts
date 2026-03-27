const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || res.statusText);
  }

  return res.json();
}

// Auth
export async function requestLogin(telegramUsername: string) {
  return request<{ challengeId: string; message: string }>('/auth/request', {
    method: 'POST',
    body: JSON.stringify({ telegramUsername }),
  });
}

export async function confirmLogin(challengeId: string, code: string) {
  return request<{ token: string; user: any }>('/auth/confirm', {
    method: 'POST',
    body: JSON.stringify({ challengeId, code }),
  });
}

export async function getMe() {
  return request<{ userId: string; balance: number }>('/auth/me');
}

// Models
export async function getModels() {
  return request<Array<{ id: string; inputPricePer1M: number; outputPricePer1M: number }>>('/models');
}

// Chats
export async function createChat(model?: string) {
  return request<{ chatId: string; model: string }>('/chats', {
    method: 'POST',
    body: JSON.stringify({ model }),
  });
}

export async function listChats() {
  return request<any[]>('/chats');
}

export async function getMessages(chatId: string) {
  return request<any[]>(`/chats/${chatId}/messages`);
}

export async function sendMessage(chatId: string, message: string) {
  return request<any>(`/chats/${chatId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function sendMessageStream(
  chatId: string,
  message: string,
  onDelta: (text: string) => void,
  onDone: (data: any) => void,
  onError: (error: string) => void,
) {
  const res = await fetch(`${API_BASE}/chats/${chatId}/messages/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
    },
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

  const token = getToken();
  const res = await fetch(`${API_BASE}/chats/${chatId}/voice`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || res.statusText);
  }

  return res.json();
}
