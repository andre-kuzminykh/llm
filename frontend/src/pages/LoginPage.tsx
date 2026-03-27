import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { requestLogin, confirmLogin } from '../services/api';
import styles from './LoginPage.module.css';

export function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'username' | 'code'>('username');

  async function handleRequestLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await requestLogin(username.replace('@', ''));
      setChallengeId(result.challengeId);
      setStep('code');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await confirmLogin(challengeId!, code);
      login(result.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>LLM Chat</h1>
        <p className={styles.subtitle}>Sign in with your Telegram account</p>

        {step === 'username' ? (
          <form onSubmit={handleRequestLogin} className={styles.form}>
            <input
              type="text"
              placeholder="@username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className={styles.input}
              disabled={loading}
              autoFocus
            />
            <button type="submit" className={styles.button} disabled={loading || !username.trim()}>
              {loading ? 'Sending...' : 'Send login code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleConfirmLogin} className={styles.form}>
            <p className={styles.hint}>
              A login code has been sent to your Telegram.
              Enter it below or tap the confirm button in Telegram.
            </p>
            <input
              type="text"
              placeholder="6-digit code"
              value={code}
              onChange={e => setCode(e.target.value)}
              className={styles.input}
              maxLength={6}
              disabled={loading}
              autoFocus
            />
            <button type="submit" className={styles.button} disabled={loading || code.length !== 6}>
              {loading ? 'Verifying...' : 'Confirm'}
            </button>
            <button
              type="button"
              className={styles.linkButton}
              onClick={() => { setStep('username'); setChallengeId(null); setCode(''); }}
            >
              Back
            </button>
          </form>
        )}

        {error && <div className={styles.error}>{error}</div>}
      </div>
    </div>
  );
}
