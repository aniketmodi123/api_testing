import { useEffect, useRef, useState } from 'react';
import styles from './WebSocketPanel.module.css';

const MAX_MESSAGES = 200;
const API_BASE = import.meta.env.VITE_API_BASE || 'https://api-testing-2vjt.onrender.com';

function getProxyWsUrl(targetUrl) {
  const base = API_BASE.replace(/^https?:\/\//, '');
  const scheme = API_BASE.startsWith('https') ? 'wss' : 'ws';
  return `${scheme}://${base}/api/ws-proxy?target_url=${encodeURIComponent(targetUrl)}`;
}

export default function WebSocketPanel({ url }) {
  const [status, setStatus] = useState('disconnected'); // disconnected | connecting | connected
  const [messages, setMessages] = useState([]);
  const [msgInput, setMsgInput] = useState('');
  const wsRef = useRef(null);
  const feedRef = useRef(null);

  // Auto-scroll to bottom when messages arrive
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  // Clean up on unmount
  useEffect(() => {
    return () => wsRef.current?.close();
  }, []);

  const addMessage = (dir, text) => {
    const entry = { id: Date.now() + Math.random(), dir, text, time: new Date().toLocaleTimeString() };
    setMessages(prev => {
      const next = [...prev, entry];
      return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
    });
  };

  const connect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setStatus('connecting');
    setMessages([]);

    const proxyUrl = getProxyWsUrl(url);
    const ws = new WebSocket(proxyUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      addMessage('system', 'Connected');
    };

    ws.onmessage = e => {
      addMessage('recv', e.data);
    };

    ws.onerror = () => {
      addMessage('system', 'Connection error');
    };

    ws.onclose = e => {
      setStatus('disconnected');
      addMessage('system', `Disconnected (code ${e.code})`);
      wsRef.current = null;
    };
  };

  const disconnect = () => {
    wsRef.current?.close();
  };

  const send = () => {
    if (!msgInput.trim() || !wsRef.current || status !== 'connected') return;
    wsRef.current.send(msgInput);
    addMessage('send', msgInput);
    setMsgInput('');
  };

  const handleKeyDown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const statusColor = status === 'connected' ? '#22c55e' : status === 'connecting' ? '#f59e0b' : '#6b7280';

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.statusDot} style={{ background: statusColor }} />
        <span className={styles.statusText}>{status}</span>
        <span className={styles.urlLabel}>{url}</span>
        <div className={styles.headerActions}>
          {status === 'disconnected' ? (
            <button className={styles.connectBtn} onClick={connect}>Connect</button>
          ) : (
            <button className={styles.disconnectBtn} onClick={disconnect}>Disconnect</button>
          )}
          <button
            className={styles.clearBtn}
            onClick={() => setMessages([])}
            title="Clear messages"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Messages feed */}
      <div className={styles.feed} ref={feedRef}>
        {messages.length === 0 ? (
          <div className={styles.emptyFeed}>No messages yet. Connect and start sending.</div>
        ) : (
          messages.map(m => (
            <div key={m.id} className={`${styles.message} ${styles[m.dir]}`}>
              <span className={styles.msgTime}>{m.time}</span>
              <span className={styles.msgText}>{m.text}</span>
              {m.dir === 'send' && <span className={styles.arrow}>→</span>}
              {m.dir === 'recv' && <span className={styles.arrow}>←</span>}
            </div>
          ))
        )}
      </div>

      {/* Input */}
      <div className={styles.inputRow}>
        <textarea
          className={styles.msgInput}
          value={msgInput}
          onChange={e => setMsgInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Message (Enter to send, Shift+Enter for newline)'
          rows={2}
          disabled={status !== 'connected'}
        />
        <button
          className={styles.sendBtn}
          onClick={send}
          disabled={status !== 'connected' || !msgInput.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
