import { Module, forwardRef } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { UserModule } from '../user/user.module';
import { WalletModule } from '../wallet/wallet.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [UserModule, WalletModule, forwardRef(() => TelegramModule)],
  providers: [AuthService, AuthGuard],
  controllers: [AuthController],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
