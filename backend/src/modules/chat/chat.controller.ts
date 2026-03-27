import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response, Request } from 'express';
import { ChatService } from './chat.service';
import { AuthGuard } from '../auth/auth.guard';
import { diskStorage } from 'multer';
import { v4 as uuid } from 'uuid';
import * as path from 'path';

@Controller('chats')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(private chatService: ChatService) {}

  @Post()
  async createSession(@Req() req: Request, @Body() body: { model?: string }) {
    const userId = (req as any).userId;
    const session = await this.chatService.createSession(userId, body.model);
    return { chatId: session.id, model: session.model };
  }

  @Get()
  async listSessions(@Req() req: Request) {
    const userId = (req as any).userId;
    return this.chatService.getUserSessions(userId);
  }

  @Get(':id/messages')
  async getMessages(@Param('id') id: string) {
    return this.chatService.getMessages(id);
  }

  @Post(':id/messages')
  async sendMessage(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: { message: string },
  ) {
    const userId = (req as any).userId;
    return this.chatService.sendMessage(userId, id, body.message);
  }

  @Post(':id/messages/stream')
  async sendMessageStream(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
    @Body() body: { message: string },
  ) {
    const userId = (req as any).userId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      for await (const event of this.chatService.sendMessageStream(userId, id, body.message)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', data: { message: error.message } })}\n\n`);
    }

    res.end();
  }

  @Post(':id/voice')
  @UseInterceptors(
    FileInterceptor('audio', {
      storage: diskStorage({
        destination: process.env.UPLOAD_DIR || './uploads',
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname) || '.ogg';
          cb(null, `${uuid()}${ext}`);
        },
      }),
      limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
    }),
  )
  async sendVoice(
    @Req() req: Request,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const userId = (req as any).userId;
    return this.chatService.sendVoiceMessage(userId, id, file.path);
  }
}
