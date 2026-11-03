import { useEffect, useState } from 'react';
import { EXPORT_TABLES, downloadTableAsCsv, type ExportTableConfig } from '../services/dataExport';

interface DataExportDialogProps {
  onClose: () => void;
}

export function DataExportDialog({ onClose }: DataExportDialogProps) {
  const [busyTable, setBusyTable] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function download(config: ExportTableConfig) {
    setBusyTable(config.table);
    setError(null);
    try {
      await downloadTableAsCsv(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The download failed. Please try again.');
    } finally {
      setBusyTable(null);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <h2 id="export-title">Download data</h2>
          <p className="muted">Each table downloads as a spreadsheet file (CSV).</p>
        </header>

        <ul className="export-list">
          {EXPORT_TABLES.map((config) => (
            <li key={config.table} className="export-row">
              <div>
                <p className="export-name">{config.label}</p>
                <p className="muted">{config.description}</p>
              </div>
              <button
                type="button"
                className="button button-ghost button-small"
                disabled={busyTable !== null}
                onClick={() => void download(config)}
              >
                {busyTable === config.table ? 'Preparing...' : 'Download CSV'}
              </button>
            </li>
          ))}
        </ul>

        {error && <p className="banner-error" role="alert">{error}</p>}

        <footer className="dialog-footer">
          <button type="button" className="button button-ghost" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
