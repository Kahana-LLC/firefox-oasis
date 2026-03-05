import { h } from 'preact';
import type { ConfirmationData } from '../types';

export function ConfirmationModal({
  data,
  onConfirm,
  onCancel,
}: {
  data: ConfirmationData;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="confirmation-overlay"
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
        className="confirmation-modal"
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            background: '#FFF8E1',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px auto',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7A9200" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>

        <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#333' }}>
          Confirm Action
        </h3>

        <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#666' }}>
          {data.description}
        </p>

        <div
          style={{
            background: '#E8F5E9',
            borderRadius: '8px',
            padding: '8px 12px',
            marginBottom: '20px',
            fontSize: '13px',
            color: '#2E7D32',
          }}
        >
          Command: {data.command}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '1px solid #ddd',
              borderRadius: '8px',
              background: '#fff',
              color: '#333',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: 'none',
              borderRadius: '8px',
              background: '#7A9200',
              color: '#fff',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Approve
          </button>
        </div>
      </div>
    </div>
  );
}
