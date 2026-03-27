import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  const [models, setModels] = useState<Array<{ id: string }>>([]);
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [chatId, setChatId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
  }, []);

  async function handleNewChat() {
    try {
      const result = await createChat(selectedModel);
      setChatId(result.chatId);
      setMessages([]);
      setStreamText('');
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
        setStreaming(false);
        setStreamText('');
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
      await sendVoice(currentChatId, audioBlob);
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
      </aside>

      {/* Main chat area */}
      <main className={styles.main}>
        {/* Header */}
        <header className={styles.header}>
          <span className={styles.title}>LLM Chat</span>
          <select
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
            className={styles.modelSelect}
          >
            {models.map(m => (
              <option key={m.id} value={m.id}>{m.id}</option>
            ))}
          </select>
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
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (Enter to send)"
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
