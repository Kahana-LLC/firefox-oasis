import { h } from 'preact';

export function ToolActionMessage({ status, name }: { status: 'pending'|'running'|'done'|'error', name: string }) {
  let icon, text, color;
  if (status === 'running' || status === 'pending') {
    icon = (
      <svg width="20" height="20" viewBox="0 0 50 50" style={{ marginRight: 8 }}>
        <circle cx="25" cy="25" r="20" stroke="#7A9200" strokeWidth="5" fill="none" opacity="0.2" />
        <circle cx="25" cy="25" r="20" stroke="#7A9200" strokeWidth="5" fill="none" strokeDasharray="31.4 94.2" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
        </circle>
      </svg>
    );
    text = 'Running...';
    color = '#7A9200';
  } else if (status === 'done') {
    icon = (
      <svg width="20" height="20" viewBox="0 0 20 20" style={{ marginRight: 8 }}>
        <circle cx="10" cy="10" r="9" stroke="#8BC34A" strokeWidth="2" fill="none" />
        <path d="M6 10l2 2 4-4" stroke="#8BC34A" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
    text = 'Done';
    color = '#8BC34A';
  } else {
    icon = (
      <svg width="20" height="20" viewBox="0 0 20 20" style={{ marginRight: 8 }}>
        <circle cx="10" cy="10" r="9" stroke="#d32f2f" strokeWidth="2" fill="none" />
        <line x1="7" y1="7" x2="13" y2="13" stroke="#d32f2f" strokeWidth="2" />
        <line x1="13" y1="7" x2="7" y2="13" stroke="#d32f2f" strokeWidth="2" />
      </svg>
    );
    text = 'Error';
    color = '#d32f2f';
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: '#F2F4E5', borderRadius: 8, padding: '12px 16px', margin: '12px 0', color, fontWeight: 500, fontSize: 15 }}>
      {icon}
      <span style={{ marginRight: 8 }}>{name}</span>
      <span style={{ fontWeight: 400, fontSize: 14, color: '#666' }}>{text}</span>
    </div>
  );
}
