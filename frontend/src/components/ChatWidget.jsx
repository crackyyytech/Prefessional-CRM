import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';

export default function ChatWidget() {
  const { can } = useAuth();
  const { appName } = useBranding();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'How can I help today?' },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const messagesRef = useRef(messages);
  const speakRef = useRef(() => {});

  messagesRef.current = messages;

  useEffect(() => {
    setMessages([{ role: 'assistant', content: `How can I help with ${appName} today?` }]);
  }, [appName]);

  useEffect(() => {
    if (!can('ai:chat')) return;
    api.getAiStatus()
      .then((data) => {
        setEnabled(Boolean(data.enabled));
        setProviders(data.providers || []);
        setProvider(data.defaultProvider || 'auto');
      })
      .catch(() => setEnabled(false));
  }, [can]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open, sending]);

  const submitText = useCallback(async (text, shouldSpeak = false) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || sending || !enabled) return null;

    const nextMessages = [...messagesRef.current, { role: 'user', content: trimmed }];
    setMessages(nextMessages);
    setInput('');
    setSending(true);

    try {
      const history = nextMessages.map((m) => ({ role: m.role, content: m.content }));
      const data = await api.chatAi({
        messages: history,
        provider: provider && provider !== 'auto' ? provider : 'auto',
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      if (shouldSpeak) speakRef.current(data.reply);
      return data.reply;
    } catch (err) {
      const msg = `Sorry — ${err.message}`;
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
      if (shouldSpeak) speakRef.current(msg);
      return msg;
    } finally {
      setSending(false);
    }
  }, [sending, enabled, provider]);

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

  if (!can('ai:chat')) return null;

  const sendMessage = async (event) => {
    event.preventDefault();
    await submitText(input, speakEnabled);
  };

  return (
    <div className="chat-widget">
      {open && (
        <div className="chat-widget-panel">
          <div className="chat-widget-header">
            <div>
              <strong>{appName} AI</strong>
              <span>{enabled ? (listening ? 'Listening…' : 'Online · voice ready') : 'Offline — configure in Settings'}</span>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Close</button>
          </div>
          {providers.length > 1 && (
            <div className="chat-widget-provider">
              <select value={provider} onChange={(e) => setProvider(e.target.value)}>
                {providers.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="chat-widget-messages">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`chat-bubble ${message.role}`}>
                <p>{message.content}</p>
              </div>
            ))}
            {sending && <div className="chat-bubble assistant"><p>Thinking...</p></div>}
            <div ref={endRef} />
          </div>
          <form className="chat-input-row chat-input-row-voice" onSubmit={sendMessage}>
            {voiceSupported && (
              <div className="chat-voice-controls">
                <button
                  type="button"
                  className={`btn btn-secondary voice-btn${listening ? ' listening' : ''}`}
                  onClick={toggleListening}
                  disabled={!enabled || sending}
                  title={listening ? 'Stop listening' : 'Speak your question'}
                  aria-label={listening ? 'Stop listening' : 'Start voice input'}
                >
                  {listening ? '⏹' : '🎤'}
                </button>
                <button
                  type="button"
                  className={`btn btn-secondary voice-btn${speakEnabled ? ' active' : ''}`}
                  onClick={() => {
                    if (speakEnabled) stopSpeaking();
                    setSpeakEnabled((v) => !v);
                  }}
                  title={speakEnabled ? 'Mute voice replies' : 'Enable voice replies'}
                  aria-label={speakEnabled ? 'Mute voice replies' : 'Enable voice replies'}
                >
                  {speakEnabled ? '🔊' : '🔇'}
                </button>
              </div>
            )}
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={enabled ? (listening ? 'Listening…' : 'Ask or tap mic…') : 'AI offline'}
              disabled={!enabled || sending}
            />
            <button className="btn btn-primary" type="submit" disabled={!enabled || sending || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className="chat-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open AI voice assistant"
      >
        AI
      </button>
    </div>
  );
}
