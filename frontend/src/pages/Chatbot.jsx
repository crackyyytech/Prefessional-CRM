import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';

export default function Chatbot() {
  const { can } = useAuth();
  const { appName } = useBranding();
  const [status, setStatus] = useState(null);
  const [provider, setProvider] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hi! I am the ${appName} assistant. Ask me about contacts, deals, tasks, or pipeline tips.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef(null);
  const messagesRef = useRef(messages);
  const speakRef = useRef(() => {});

  messagesRef.current = messages;

  useEffect(() => {
    api.getAiStatus()
      .then((data) => {
        setStatus(data);
        setProvider(data.defaultProvider || 'auto');
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const submitText = useCallback(async (text, shouldSpeak = false) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || sending) return null;

    if (!status?.enabled) {
      setError('AI chatbot is not enabled. Ask an admin to configure it in Settings.');
      return null;
    }

    const nextMessages = [...messagesRef.current, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setError('');
    setSending(true);

    try {
      const history = nextMessages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

      const data = await api.chatAi({
        messages: history,
        provider: provider && provider !== 'auto' ? provider : 'auto',
      });
      const providerLabel = provider === 'auto'
        ? `Auto (${data.provider})`
        : (status?.providers || []).find((p) => p.id === data.provider)?.label || data.provider;
      let meta = `${providerLabel || data.provider || ''} · ${data.model || ''}`.trim();
      if (data.mergeMode && data.fallbackUsed) {
        meta += ` · merged (${(data.providersTried || []).length} tried)`;
      } else if (data.fallbackUsed && provider && provider !== 'auto' && data.provider !== provider) {
        meta += ` (fallback — ${provider} failed)`;
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, meta }]);
      if (data.fallbackUsed && provider && data.provider !== provider) {
        setError(
          data.balanceFallback
            ? `${provider} unavailable (Pollen/credits empty or model blocked) — replied using ${data.provider} instead. Earn free Pollen at enter.pollinations.ai or use Gemini/Groq.`
            : `${provider} failed — replied using ${data.provider} instead. Check API key in Settings → AI.`
        );
      }
      if (shouldSpeak) speakRef.current(data.reply);
      return data.reply;
    } catch (err) {
      setError(err.message);
      const msg = `Sorry — ${err.message}`;
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      if (shouldSpeak) speakRef.current(msg);
      return msg;
    } finally {
      setSending(false);
    }
  }, [sending, status, provider]);

  const submitTextRef = useRef(submitText);
  submitTextRef.current = submitText;

  const handleVoiceTranscript = useCallback((text) => {
    setInput(text);
    submitTextRef.current?.(text, true);
  }, []);

  const {
    listening,
    supported: voiceSupported,
    speakEnabled,
    setSpeakEnabled,
    toggleListening,
    speak,
    stopSpeaking,
  } = useVoiceAssistant({ onTranscript: handleVoiceTranscript });

  speakRef.current = speak;

  const sendMessage = async (event) => {
    event.preventDefault();
    await submitText(input, speakEnabled);
  };

  const providers = status?.providers || [];

  return (
    <>
      <div className="page-header">
        <div>
          <h2>AI Chatbot</h2>
          <p>Text or voice — uses all connected AI providers merged with automatic fallback</p>
        </div>
        <div className="actions">
          {providers.length > 0 && (
            <label className="inline-select">
              AI provider
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                {providers.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label} ({item.model})
                  </option>
                ))}
              </select>
            </label>
          )}
          {can('ai:manage') && (
            <Link className="btn btn-secondary" to="/settings">AI Settings</Link>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!status?.enabled && (
        <div className="error-banner">
          Chatbot is offline. {can('ai:manage')
            ? 'Go to Settings → AI Integrations, connect a provider, add an API key, and Save.'
            : 'Ask an admin to configure AI providers in Settings.'}
        </div>
      )}

      {voiceSupported && status?.enabled && (
        <p className="panel-note" style={{ marginBottom: 12 }}>
          Voice assistant ready — tap the microphone to speak, or toggle speaker for spoken replies.
        </p>
      )}

      <div className="chat-shell">
        <div className="chat-messages">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`chat-bubble ${message.role}`}>
              <span className="chat-role">
                {message.role === 'user' ? 'You' : `${appName} AI`}
                {message.meta ? ` · ${message.meta}` : ''}
              </span>
              <p>{message.content}</p>
            </div>
          ))}
          {sending && (
            <div className="chat-bubble assistant">
              <span className="chat-role">{appName} AI</span>
              <p>Thinking...</p>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form className="chat-input-row chat-input-row-voice" onSubmit={sendMessage}>
          {voiceSupported && (
            <div className="chat-voice-controls">
              <button
                type="button"
                className={`btn btn-secondary voice-btn${listening ? ' listening' : ''}`}
                onClick={toggleListening}
                disabled={!status?.enabled || sending}
                title={listening ? 'Stop listening' : 'Speak your question'}
              >
                {listening ? '⏹ Stop' : '🎤 Voice'}
              </button>
              <button
                type="button"
                className={`btn btn-secondary voice-btn${speakEnabled ? ' active' : ''}`}
                onClick={() => {
                  if (speakEnabled) stopSpeaking();
                  setSpeakEnabled((v) => !v);
                }}
                title={speakEnabled ? 'Mute voice replies' : 'Enable voice replies'}
              >
                {speakEnabled ? '🔊 On' : '🔇 Off'}
              </button>
            </div>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={status?.enabled ? (listening ? 'Listening…' : 'Ask or use voice…') : 'AI not configured'}
            disabled={!status?.enabled || sending}
          />
          <button className="btn btn-primary" type="submit" disabled={!status?.enabled || sending || !input.trim()}>
            Send
          </button>
        </form>
      </div>
    </>
  );
}
