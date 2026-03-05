import { h } from 'preact';

export function ActiveToolIndicator({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: '#7A9200',
        fontSize: '13px',
        margin: '8px 0',
        paddingLeft: '4px',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 50 50">
        <circle cx="25" cy="25" r="20" stroke="#7A9200" strokeWidth="4" fill="none" opacity="0.2" />
        <circle cx="25" cy="25" r="20" stroke="#7A9200" strokeWidth="4" fill="none" strokeDasharray="31.4 94.2" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite" />
        </circle>
      </svg>
      <span>{label}</span>
    </div>
  );
}
