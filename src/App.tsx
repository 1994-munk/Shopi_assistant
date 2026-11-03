import { BasketPanel } from './components/BasketPanel';
import { ChatView } from './components/ChatView';
import { useShopiSession } from './hooks/useShopiSession';

export default function App() {
  const session = useShopiSession();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">S</span>
          <div>
            <strong className="brand-name">Shopi</strong>
            <span className="brand-tagline">Agentic shopping assistant</span>
          </div>
        </div>
      </header>

      <main className="assistant-layout">
        {session.loadError && <p className="banner-error" role="alert">{session.loadError}</p>}
        {session.loading ? <p className="muted loading-text">Loading the catalog...</p> : <ChatView session={session} />}
        {!session.loading && <BasketPanel session={session} />}
      </main>
    </div>
  );
}
