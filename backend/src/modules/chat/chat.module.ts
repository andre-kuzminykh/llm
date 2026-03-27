import { Module } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { OpenAIModule } from '../openai/openai.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [OpenAIModule, WalletModule],
  providers: [ChatService],
  controllers: [ChatController],
  exports: [ChatService],
})
export class ChatModule {}
