import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { WalletModule } from '../wallet/wallet.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [WalletModule, UserModule],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
