import { h } from 'preact';
import type { ClarificationData } from '../types';

export function ClarificationModal({
  data,
  onSelect,
  onCancel,
}: {
  data: ClarificationData;
  onSelect: (optionId: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="clarification-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        className="clarification-modal"
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '440px',
          width: '90%',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            background: '#F2F4E5',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#7A9200"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#333' }}>
          What did you mean?
        </h3>

        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
          I want to make sure I understand your request correctly. Please pick the best match:
        </p>

        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}
        >
          {data.options.map((option, idx) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onSelect(option.id)}
              style={{
                padding: '12px 16px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                background: '#fafafa',
                color: '#333',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{ fontWeight: 600, marginRight: '8px', color: '#7A9200' }}>
                {idx + 1}.
              </span>
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '10px 20px',
            border: '1px solid #ddd',
            borderRadius: '8px',
            background: '#fff',
            color: '#666',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          None of these
        </button>
      </div>
    </div>
  );
}
