import { useState } from 'react';
import { BasketPanel } from './components/BasketPanel';
import { ChatView } from './components/ChatView';
import { DataExportDialog } from './components/DataExportDialog';
import { useShopiSession } from './hooks/useShopiSession';

export default function App() {
  const session = useShopiSession();
  const [exportOpen, setExportOpen] = useState(false);

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
        <button type="button" className="button button-ghost button-small" onClick={() => setExportOpen(true)}>
          Download data
        </button>
      </header>

      <main className="assistant-layout">
        {session.loadError && <p className="banner-error" role="alert">{session.loadError}</p>}
        {session.loading ? <p className="muted loading-text">Loading the catalog...</p> : <ChatView session={session} />}
        {!session.loading && <BasketPanel session={session} />}
      </main>

      {exportOpen && <DataExportDialog onClose={() => setExportOpen(false)} />}
    </div>
  );
}
