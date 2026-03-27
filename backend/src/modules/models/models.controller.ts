import { Controller, Get } from '@nestjs/common';
import { DEFAULT_ALLOWED_MODELS, CHAT_MODEL_PRICES } from '../../config/prices';

@Controller('models')
export class ModelsController {
  @Get()
  getModels() {
    return DEFAULT_ALLOWED_MODELS.map(model => {
      const pricing = CHAT_MODEL_PRICES.find(p => p.model === model);
      return {
        id: model,
        inputPricePer1M: pricing ? pricing.inputPricePerToken * 1_000_000 : null,
        outputPricePer1M: pricing ? pricing.outputPricePerToken * 1_000_000 : null,
      };
    });
  }
}
