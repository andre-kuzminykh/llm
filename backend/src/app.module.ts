import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './modules/prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { ChatModule } from './modules/chat/chat.module';
import { TelegramModule } from './modules/telegram/telegram.module';
import { OpenAIModule } from './modules/openai/openai.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { AdminModule } from './modules/admin/admin.module';
import { UserModule } from './modules/user/user.module';
import { ModelsModule } from './modules/models/models.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    ChatModule,
    TelegramModule,
    OpenAIModule,
    WalletModule,
    AdminModule,
    UserModule,
    ModelsModule,
  ],
})
export class AppModule {}
