import React from 'react';
import styles from './ChatMessage.module.css';

interface Props {
  message: {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    audioTranscript?: { transcriptText: string } | null;
  };
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming }: Props) {
  const isUser = message.role === 'user';

  return (
    <div className={`${styles.message} ${isUser ? styles.user : styles.assistant}`}>
      <div className={styles.label}>{isUser ? 'You' : 'Assistant'}</div>
      <div className={styles.content}>
        {message.audioTranscript && (
          <div className={styles.transcript}>
            Voice: "{message.audioTranscript.transcriptText}"
          </div>
        )}
        <div className={styles.text}>
          {message.content}
          {isStreaming && <span className={styles.cursor}>|</span>}
        </div>
      </div>
    </div>
  );
}
