# LLM Chat — Technical Specification

## Overview

Unified OpenAI Chat Access via Telegram Bot + React Web App with Voice Input and USD Credit Ledger.

## Architecture

```
┌─────────────┐     ┌─────────────┐
│  Telegram    │     │  React Web  │
│  Bot Client  │     │  App (Vite) │
└──────┬───────┘     └──────┬──────┘
       │                    │
       │    ┌───────────┐   │
       └────┤  NestJS   ├───┘
            │  Backend  │
            └─────┬─────┘
                  │
       ┌──────────┼──────────┐
       │          │          │
  ┌────┴────┐ ┌──┴───┐ ┌───┴────┐
  │PostgreSQL│ │OpenAI│ │Telegram│
  │ (Prisma) │ │ API  │ │Bot API │
  └─────────┘ └──────┘ └────────┘
```

## Stack

- **Backend**: Node.js + NestJS + Prisma + PostgreSQL
- **Frontend**: React + Vite + TypeScript
- **Telegram**: grammY
- **AI**: OpenAI Responses API (text), Audio API (speech-to-text)
- **Streaming**: SSE (Server-Sent Events)
- **Deploy**: Docker Compose + Nginx

## Data Model

### Entities

| Entity | Description |
|--------|-------------|
| User | Telegram user with USD wallet balance |
| AuthChallenge | One-time login code for web auth via Telegram |
| ChatSession | Conversation with selected model |
| Message | User or assistant message in a session |
| AudioTranscript | Voice message transcription metadata |
| UsageRecord | Per-request token/audio usage and cost |
| PriceSnapshot | Model pricing reference table |
| WalletLedgerEntry | Credit/debit transaction log |
| AdminAuditLog | Admin operation audit trail |

### Key Relationships

- User 1:N ChatSession 1:N Message
- Message 0:1 AudioTranscript
- User 1:N WalletLedgerEntry
- User 1:N UsageRecord

## API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/request | Request login (sends code to Telegram) |
| POST | /api/auth/confirm | Confirm login with code |
| GET | /api/auth/me | Get current user + balance |

### Chat
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/chats | Create new chat session |
| GET | /api/chats | List user's chat sessions |
| GET | /api/chats/:id/messages | Get messages in session |
| POST | /api/chats/:id/messages | Send text message |
| POST | /api/chats/:id/messages/stream | Send message with SSE streaming |
| POST | /api/chats/:id/voice | Send voice message (multipart) |

### Other
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/models | List available models with pricing |
| POST | /api/telegram/webhook | Telegram webhook endpoint |

## Telegram Bot

### User Commands (Burger Menu)
| Command | Description |
|---------|-------------|
| /start | Register user, show welcome |
| /new | Start new chat (shows model picker) |
| /models | Choose model (inline buttons with checkmark) |
| /balance | Show current USD balance |

### Admin Commands (Hidden)
Only available to Telegram IDs in `ADMIN_TELEGRAM_IDS` env var. Not shown in /help or bot menu.

| Command | Description |
|---------|-------------|
| /add_credit @user amount | Add USD credit |
| /remove_credit @user amount | Remove USD credit |
| /balance_of @user | View user balance |
| /block_user @user | Block user |
| /unblock_user @user | Unblock user |
| /user_usage @user [days] | Usage summary |

### Behavior
- Text messages go to current chat session with selected model
- Voice messages are transcribed via OpenAI Audio API, then sent to chat
- Bot shows continuous "typing..." indicator while processing
- No balance/cost info in chat responses (clean output)
- Model selection via inline keyboard buttons with current model marked

## Web App

### Login Flow
1. User enters @username
2. Backend sends 6-digit code to user's Telegram
3. User enters code in web app (or taps confirm button in Telegram)
4. JWT token issued, web session starts

### Chat UI
- Sidebar: session list, new chat button, balance badge, logout
- Header: model selector dropdown, last request cost
- Messages: streaming rendering via SSE, user/assistant bubbles
- Input: text area (Enter to send), mic button (hold to record)
- Mobile-friendly responsive layout
- Dark theme

## Billing

### How It Works
1. User sends message (text or voice)
2. Backend checks balance >= minimum threshold before calling OpenAI
3. OpenAI returns response with usage (input_tokens, output_tokens)
4. Backend calculates cost from usage * price table
5. Cost debited from user's USD wallet
6. All transactions recorded in ledger

### Price Table (per token / per minute)
| Model | Input/1M | Output/1M |
|-------|----------|-----------|
| gpt-4o-mini | $0.15 | $0.60 |
| gpt-4o | $2.50 | $10.00 |
| o3-mini | $1.10 | $4.40 |
| o4-mini | $1.10 | $4.40 |

| Transcription Model | Per Minute |
|---------------------|------------|
| gpt-4o-mini-transcribe | $0.003 |
| gpt-4o-transcribe | $0.006 |

## Security

- OpenAI API key never leaves backend
- Web auth requires Telegram confirmation (not just username)
- JWT tokens with configurable expiry
- Admin commands protected by Telegram ID allowlist
- All admin operations logged in audit trail
- Balance check before every OpenAI API call

## Environment Variables

See `backend/.env.example` for full list. Key variables:
- `DATABASE_URL` — PostgreSQL connection string
- `OPENAI_API_KEY` — OpenAI API key
- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `ADMIN_TELEGRAM_IDS` — Comma-separated admin Telegram user IDs
- `JWT_SECRET` — Secret for JWT signing
- `TELEGRAM_WEBHOOK_URL` — Set for production; omit for polling mode
