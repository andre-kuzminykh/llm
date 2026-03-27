import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getModels,
  createChat,
  listChats,
  getMessages,
  sendMessageStream,
  sendVoice,
} from '../services/api';
import { ChatMessage } from '../components/ChatMessage';
import { VoiceRecorder } from '../components/VoiceRecorder';
import styles from './ChatPage.module.css';

interface MessageItem {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  audioTranscript?: { transcriptText: string } | null;
}

export function ChatPage() {
  const { balance, setBalance, logout } = useAuth();
  const [models, setModels] = useState<Array<{ id: string }>>([]);
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [chatId, setChatId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [lastCost, setLastCost] = useState<number | null>(null);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getModels().then(setModels).catch(() => {});
    listChats().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  const loadChat = useCallback(async (id: string) => {
    setChatId(id);
    const msgs = await getMessages(id);
    setMessages(msgs);
    setStreamText('');
    setLastCost(null);
  }, []);

  async function handleNewChat() {
    try {
      const result = await createChat(selectedModel);
      setChatId(result.chatId);
      setMessages([]);
      setStreamText('');
      setLastCost(null);
      setSessions(prev => [{ id: result.chatId, model: result.model, updatedAt: new Date().toISOString() }, ...prev]);
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleSend() {
    if (!input.trim() || streaming) return;

    let currentChatId = chatId;
    if (!currentChatId) {
      const result = await createChat(selectedModel);
      currentChatId = result.chatId;
      setChatId(currentChatId);
      setSessions(prev => [{ id: result.chatId, model: result.model, updatedAt: new Date().toISOString() }, ...prev]);
    }

    const userMessage: MessageItem = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setStreaming(true);
    setStreamText('');
    setError('');

    await sendMessageStream(
      currentChatId,
      userMessage.content,
      (text) => setStreamText(prev => prev + text),
      (data) => {
        setMessages(prev => [
          ...prev,
          { id: data.assistantMessageId, role: 'assistant', content: '' },
        ]);
        // Replace the temp streaming text with the final message
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.id === data.assistantMessageId) {
            // Content was streamed, get it from streamText
          }
          return updated;
        });
        setLastCost(data.costUsd);
        setBalance(data.balanceUsd);
        setStreaming(false);
        setStreamText('');
        // Reload messages to get full state
        getMessages(currentChatId!).then(setMessages);
      },
      (errMsg) => {
        setError(errMsg);
        setStreaming(false);
        setStreamText('');
      },
    );
  }

  async function handleVoice(audioBlob: Blob) {
    let currentChatId = chatId;
    if (!currentChatId) {
      const result = await createChat(selectedModel);
      currentChatId = result.chatId;
      setChatId(currentChatId);
    }

    setStreaming(true);
    setError('');

    try {
      const result = await sendVoice(currentChatId, audioBlob);
      setLastCost(result.totalCostUsd);
      setBalance(result.balanceUsd);
      await loadChat(currentChatId);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <button className={styles.newChatBtn} onClick={handleNewChat}>
            + New Chat
          </button>
        </div>
        <div className={styles.sessionList}>
          {sessions.map(s => (
            <button
              key={s.id}
              className={`${styles.sessionItem} ${s.id === chatId ? styles.active : ''}`}
              onClick={() => loadChat(s.id)}
            >
              <span className={styles.sessionModel}>{s.model}</span>
              <span className={styles.sessionDate}>
                {new Date(s.updatedAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
        <div className={styles.sidebarFooter}>
          <div className={styles.balanceBadge}>
            Balance: ${balance.toFixed(4)}
          </div>
          <button className={styles.logoutBtn} onClick={logout}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main chat area */}
      <main className={styles.main}>
        {/* Header */}
        <header className={styles.header}>
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className={styles.modelSelect}
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.id}</option>
            ))}
          </select>
          {lastCost !== null && (
            <span className={styles.costBadge}>
              Last: ${lastCost.toFixed(6)}
            </span>
          )}
        </header>

        {/* Messages */}
        <div className={styles.messages}>
          {messages.length === 0 && !streaming && (
            <div className={styles.emptyState}>
              <h2>Start a conversation</h2>
              <p>Send a text or voice message</p>
            </div>
          )}
          {messages.map(msg => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
          {streaming && streamText && (
            <ChatMessage
              message={{ id: 'streaming', role: 'assistant', content: streamText }}
              isStreaming
            />
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Error */}
        {error && (
          <div className={styles.errorBar}>
            {error}
            <button onClick={() => setError('')}>x</button>
          </div>
        )}

        {/* Input */}
        <div className={styles.inputArea}>
          <VoiceRecorder onRecorded={handleVoice} disabled={streaming} />
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
            className={styles.textInput}
            rows={1}
            disabled={streaming}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={streaming || !input.trim()}
          >
            Send
          </button>
        </div>
      </main>
    </div>
  );
}
