import {
  getChatModelPrice,
  getTranscriptionPrice,
  DEFAULT_ALLOWED_MODELS,
  CHAT_MODEL_PRICES,
  TRANSCRIPTION_PRICES,
} from './prices';

describe('Prices config', () => {
  describe('getChatModelPrice', () => {
    it('should return pricing for gpt-4o-mini', () => {
      const price = getChatModelPrice('gpt-4o-mini');
      expect(price).toBeDefined();
      expect(price!.inputPricePerToken).toBe(0.00000015);
      expect(price!.outputPricePerToken).toBe(0.0000006);
    });

    it('should return pricing for gpt-4o', () => {
      const price = getChatModelPrice('gpt-4o');
      expect(price).toBeDefined();
      expect(price!.inputPricePerToken).toBe(0.0000025);
    });

    it('should return undefined for unknown model', () => {
      expect(getChatModelPrice('nonexistent')).toBeUndefined();
    });
  });

  describe('getTranscriptionPrice', () => {
    it('should return pricing for gpt-4o-mini-transcribe', () => {
      const price = getTranscriptionPrice('gpt-4o-mini-transcribe');
      expect(price).toBeDefined();
      expect(price!.pricePerMinute).toBe(0.003);
    });

    it('should return pricing for gpt-4o-transcribe', () => {
      const price = getTranscriptionPrice('gpt-4o-transcribe');
      expect(price).toBeDefined();
      expect(price!.pricePerMinute).toBe(0.006);
    });
  });

  describe('DEFAULT_ALLOWED_MODELS', () => {
    it('should include standard models', () => {
      expect(DEFAULT_ALLOWED_MODELS).toContain('gpt-4o-mini');
      expect(DEFAULT_ALLOWED_MODELS).toContain('gpt-4o');
    });

    it('should have pricing for all allowed models', () => {
      for (const model of DEFAULT_ALLOWED_MODELS) {
        expect(getChatModelPrice(model)).toBeDefined();
      }
    });
  });
});
