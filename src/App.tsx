import { useState } from 'react';
import { BasketPanel } from './components/BasketPanel';
import { ChatView } from './components/ChatView';
import { DataExportDialog } from './components/DataExportDialog';
import { useShopiSession } from './hooks/useShopiSession';

export default function App() {
  const session = useShopiSession();
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">S</span>
          <div className="brand-copy">
            <strong className="brand-name">Shopi</strong>
            <span className="brand-tagline">Vibrant grocery AI</span>
          </div>
        </div>

        <div className="topbar-actions" aria-label="Shopi status">
          <span className="status-pill">Fresh picks</span>
          <span className="status-pill status-pill-accent">Secure checkout</span>
          <button type="button" className="button button-ghost button-small" onClick={() => setExportOpen(true)}>
            Download data
          </button>
        </div>
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
