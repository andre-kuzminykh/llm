import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response, Request } from 'express';
import { ChatService } from './chat.service';
import { UserService } from '../user/user.service';
import { diskStorage } from 'multer';
import { v4 as uuid } from 'uuid';
import * as path from 'path';

const WEB_GUEST_TELEGRAM_ID = BigInt(1); // sentinel value for web guest

@Controller('web')
export class ChatPublicController {
  constructor(
    private chatService: ChatService,
    private userService: UserService,
  ) {}

  private async getOrCreateGuestUser() {
    return this.userService.findOrCreateByTelegram(
      WEB_GUEST_TELEGRAM_ID,
      'web_guest',
      'Web',
      'Guest',
    );
  }

  @Post('chats')
  async createSession(@Body() body: { model?: string }) {
    const user = await this.getOrCreateGuestUser();
    const session = await this.chatService.createSession(user.id, body.model);
    return { chatId: session.id, model: session.model };
  }

  @Get('chats')
  async listSessions() {
    const user = await this.getOrCreateGuestUser();
    return this.chatService.getUserSessions(user.id);
  }

  @Get('chats/:id/messages')
  async getMessages(@Param('id') id: string) {
    return this.chatService.getMessages(id);
  }

  @Post('chats/:id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Body() body: { message: string },
  ) {
    const user = await this.getOrCreateGuestUser();
    return this.chatService.sendMessage(user.id, id, body.message);
  }

  @Post('chats/:id/messages/stream')
  async sendMessageStream(
    @Res() res: Response,
    @Param('id') id: string,
    @Body() body: { message: string },
  ) {
    const user = await this.getOrCreateGuestUser();

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      for await (const event of this.chatService.sendMessageStream(user.id, id, body.message)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', data: { message: error.message } })}\n\n`);
    }

    res.end();
  }

  @Post('chats/:id/voice')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: diskStorage({
        destination: process.env.UPLOAD_DIR || './uploads',
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname) || '.ogg';
          cb(null, `${uuid()}${ext}`);
        },
      }),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async sendVoice(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const user = await this.getOrCreateGuestUser();
    return this.chatService.sendVoiceMessage(user.id, id, file.path);
  }
}
