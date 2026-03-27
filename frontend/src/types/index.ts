export interface User {
  id: string;
  telegramUsername: string;
  firstName: string;
  balanceUsd: number;
}

export interface ChatSession {
  id: string;
  model: string;
  title: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  chatSessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
  audioTranscript?: {
    transcriptText: string;
    durationSeconds: number;
  } | null;
}

export interface ModelInfo {
  id: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
}

export interface SendMessageResult {
  assistantMessageId: string;
  content: string;
  model: string;
  costUsd: number;
  balanceUsd: number;
  inputTokens: number;
  outputTokens: number;
}

export interface StreamEvent {
  type: 'delta' | 'done' | 'error';
  data: {
    text?: string;
    assistantMessageId?: string;
    model?: string;
    costUsd?: number;
    balanceUsd?: number;
    inputTokens?: number;
    outputTokens?: number;
    message?: string;
  };
}
