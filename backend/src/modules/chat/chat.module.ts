import { Module, forwardRef } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatPublicController } from './chat-public.controller';
import { OpenAIModule } from '../openai/openai.module';
import { WalletModule } from '../wallet/wallet.module';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [OpenAIModule, WalletModule, forwardRef(() => AuthModule), UserModule],
  providers: [ChatService],
  controllers: [ChatController, ChatPublicController],
  exports: [ChatService],
})
export class ChatModule {}
