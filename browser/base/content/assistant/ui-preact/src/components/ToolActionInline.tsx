import { h } from 'preact';
import { useState } from 'preact/hooks';

export function ToolActionInline({ status, name, output }: { status: 'pending'|'running'|'done'|'error', name: string, output?: string }) {
  const [open, setOpen] = useState(false);
  let icon, text, color;
  if (status === 'running' || status === 'pending') {
    icon = (
      <svg width="16" height="16" viewBox="0 0 50 50" style={{ marginRight: 6 }}>
        <circle cx="25" cy="25" r="20" stroke="#7A9200" strokeWidth="4" fill="none" opacity="0.18" />
        <circle cx="25" cy="25" r="20" stroke="#7A9200" strokeWidth="4" fill="none" strokeDasharray="31.4 94.2" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
    text = 'Running...';
    color = '#7A9200';
  } else if (status === 'done') {
    icon = (
      <svg width="16" height="16" viewBox="0 0 20 20" style={{ marginRight: 6 }}>
        <circle cx="10" cy="10" r="9" stroke="#8BC34A" strokeWidth="2" fill="none" />
        <path d="M6 10l2 2 4-4" stroke="#8BC34A" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
    text = 'Done';
    color = '#8BC34A';
  } else {
    icon = (
      <svg width="16" height="16" viewBox="0 0 20 20" style={{ marginRight: 6 }}>
        <circle cx="10" cy="10" r="9" stroke="#d32f2f" strokeWidth="2" fill="none" />
        <line x1="7" y1="7" x2="13" y2="13" stroke="#d32f2f" strokeWidth="2" />
        <line x1="13" y1="7" x2="7" y2="13" stroke="#d32f2f" strokeWidth="2" />
      </svg>
    );
    text = 'Error';
    color = '#d32f2f';
  }
  return (
    <div style={{ margin: '4px 0 0 0', display: 'flex', alignItems: 'flex-start', fontSize: 13, color: '#666' }}>
      <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => setOpen(o => !o)}>
        {icon}
        <span style={{ color, fontWeight: 500, marginRight: 6 }}>{name}</span>
        <span style={{ color: '#888', fontWeight: 400 }}>{text}</span>
        <svg width="14" height="14" style={{ marginLeft: 6, transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} viewBox="0 0 20 20" fill="none"><path d="M7 8l3 3 3-3" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </div>
      {open && (
        <div style={{ marginLeft: 24, marginTop: 2, background: '#F8F8F5', borderRadius: 6, padding: '8px 12px', color: '#444', fontSize: 12, minWidth: 120, boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
          <div style={{ fontWeight: 500, marginBottom: 2 }}>Status: <span style={{ color }}>{text}</span></div>
          <div style={{ fontWeight: 400, color: '#888' }}>Function: <span style={{ color: '#333' }}>{name}</span></div>
          {output && <div style={{ marginTop: 4, color: '#555' }}>Output: {output}</div>}
        </div>
      )}
    </div>
  );
}
