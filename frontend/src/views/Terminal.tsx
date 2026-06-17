import React, { useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import Button from '../components/common/Button';
import { Clipboard, Trash2 } from 'lucide-react';

export const Terminal: React.FC = () => {
  const {
    terminalLogs,
    clearTerminal,
    copyTerminal
  } = useApp();

  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [terminalLogs]);

  return (
    <div className="tab-panel active" id="panelTerminal">
      <div className="glass-panel full-terminal-container">
        <div className="terminal-header">
          <h2>Màn Hình Console Trạng Thái Tiến Trình</h2>
          <div className="terminal-actions" style={{ display: 'flex', gap: '8px' }}>
            <Button size="sm" variant="secondary" onClick={copyTerminal}>
              <Clipboard className="w-3.5 h-3.5 mr-1" /> Sao chép Logs
            </Button>
            <Button size="sm" variant="secondary" onClick={clearTerminal}>
              <Trash2 className="w-3.5 h-3.5 mr-1" /> Xóa Logs
            </Button>
          </div>
        </div>
        <div className="terminal-body full-view" id="terminalOutputFull" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {terminalLogs.map((log) => (
            <div
              key={log.id}
              className={`terminal-line ${log.type === 'error' ? 'error' : ''} ${log.type === 'system' ? 'system' : ''} ${log.type === 'success' ? 'success' : ''}`}
            >
              [{log.time}] {log.text}
            </div>
          ))}
          <div ref={terminalEndRef} />
        </div>
      </div>
    </div>
  );
};

export default Terminal;
