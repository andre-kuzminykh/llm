// OpenAI pricing snapshot — update when prices change
// Prices are per token (not per 1K tokens) for precision

export interface ModelPricing {
  model: string;
  inputPricePerToken: number;
  outputPricePerToken: number;
}

export interface TranscriptionPricing {
  model: string;
  pricePerMinute: number;
}

// GPT model prices (per token)
export const CHAT_MODEL_PRICES: ModelPricing[] = [
  // gpt-4o-mini: $0.15 / 1M input, $0.60 / 1M output
  { model: 'gpt-4o-mini', inputPricePerToken: 0.00000015, outputPricePerToken: 0.0000006 },
  // gpt-4o: $2.50 / 1M input, $10.00 / 1M output
  { model: 'gpt-4o', inputPricePerToken: 0.0000025, outputPricePerToken: 0.00001 },
  // o3-mini: $1.10 / 1M input, $4.40 / 1M output
  { model: 'o3-mini', inputPricePerToken: 0.0000011, outputPricePerToken: 0.0000044 },
  // o4-mini: $1.10 / 1M input, $4.40 / 1M output
  { model: 'o4-mini', inputPricePerToken: 0.0000011, outputPricePerToken: 0.0000044 },
];

// Transcription prices (per minute)
export const TRANSCRIPTION_PRICES: TranscriptionPricing[] = [
  // gpt-4o-mini-transcribe: $0.003 / min
  { model: 'gpt-4o-mini-transcribe', pricePerMinute: 0.003 },
  // gpt-4o-transcribe: $0.006 / min
  { model: 'gpt-4o-transcribe', pricePerMinute: 0.006 },
];

// Default whitelisted models for new users
export const DEFAULT_ALLOWED_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'o3-mini',
  'o4-mini',
];

export function getChatModelPrice(model: string): ModelPricing | undefined {
  return CHAT_MODEL_PRICES.find(p => p.model === model);
}

export function getTranscriptionPrice(model: string): TranscriptionPricing | undefined {
  return TRANSCRIPTION_PRICES.find(p => p.model === model);
}
