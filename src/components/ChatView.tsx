import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ShopiSession } from '../hooks/useShopiSession';
import { MAX_MESSAGE_LENGTH } from '../agent/safety';
import { ProductCard } from './ProductCard';

const SUGGESTIONS = [
  'Show vegan snacks under $5',
  'Gluten-free bread',
  'Add two avocados',
  "What's in my basket?",
];

interface ChatViewProps {
  session: ShopiSession;
}

export function ChatView({ session }: ChatViewProps) {
  const [draft, setDraft] = useState('');
  const transcriptRef = useRef<HTMLDivElement>(null);
  const { products, messages, busy, send } = session;

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTo({ top: transcript.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    void send(draft);
    setDraft('');
  }

  return (
    <section className="chat" aria-label="Chat with Shopi">
      <div className="transcript" ref={transcriptRef} role="log" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={`message-row message-row-${message.author}`}>
            <div className={`bubble bubble-${message.author}`}>
              <p className="bubble-text">{message.text}</p>
              {message.productIds.length > 0 && (
                <div className="product-grid">
                  {message.productIds.flatMap((id) => {
                    const product = products.find((candidate) => candidate.id === id);
                    return product ? [
                      <ProductCard
                        key={id}
                        product={product}
                        disabled={busy}
                        onAdd={(chosen) => void send(`add ${chosen.name}`)}
                      />,
                    ] : [];
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <p className="typing">Shopi is thinking...</p>}
      </div>

      <div className="composer">
        <div className="suggestions">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="chip"
              disabled={busy}
              onClick={() => void send(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
        <form className="composer-form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor="shopi-input">
            Message Shopi
          </label>
          <input
            id="shopi-input"
            className="text-input"
            type="text"
            value={draft}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder="Tell Shopi what you need"
            onChange={(event) => setDraft(event.target.value)}
            disabled={busy}
            autoComplete="off"
          />
          <button className="button button-primary" type="submit" disabled={busy || !draft.trim()}>
            Send
          </button>
        </form>
      </div>
    </section>
  );
}
