import { useState } from 'react';
import { BasketPanel } from './components/BasketPanel';
import { ChatView } from './components/ChatView';
import { RequirementsView } from './components/RequirementsView';
import { useShopiSession } from './hooks/useShopiSession';

type View = 'assistant' | 'requirements';

export default function App() {
  const [view, setView] = useState<View>('assistant');
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
        <nav className="tabs" aria-label="Main">
          <button
            type="button"
            className={`tab ${view === 'assistant' ? 'tab-active' : ''}`}
            aria-current={view === 'assistant' ? 'page' : undefined}
            onClick={() => setView('assistant')}
          >
            Assistant
          </button>
          <button
            type="button"
            className={`tab ${view === 'requirements' ? 'tab-active' : ''}`}
            aria-current={view === 'requirements' ? 'page' : undefined}
            onClick={() => setView('requirements')}
          >
            Requirements
          </button>
        </nav>
      </header>

      {view === 'assistant' ? (
        <main className="assistant-layout">
          {session.loadError && <p className="banner-error" role="alert">{session.loadError}</p>}
          {session.loading ? <p className="muted loading-text">Loading the catalog...</p> : <ChatView session={session} />}
          {!session.loading && <BasketPanel session={session} />}
        </main>
      ) : (
        <main className="page">
          <RequirementsView />
        </main>
      )}
    </div>
  );
}
