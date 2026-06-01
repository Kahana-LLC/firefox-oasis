import { h } from 'preact';
import type { ClarificationData } from '../types';

export function ClarificationModal({
  data,
  onSelect,
  directInputOpen,
  directInputValue,
  onOpenDirectInput,
  onDirectInputChange,
  onTellDirectly,
}: {
  data: ClarificationData;
  onSelect: (optionId: string) => void;
  directInputOpen: boolean;
  directInputValue: string;
  onOpenDirectInput: () => void;
  onDirectInputChange: (value: string) => void;
  onTellDirectly: () => void;
}) {
  const handleNumericShortcut = (event: KeyboardEvent) => {
    if (directInputOpen) {
      return;
    }
    if (event.key === '1' || event.key === '2') {
      const option = data.options[Number(event.key) - 1];
      if (option) {
        event.preventDefault();
        onSelect(option.id);
      }
      return;
    }
    if (event.key === '3') {
      event.preventDefault();
      onOpenDirectInput();
    }
  };

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="oasis-clarification-title"
        onKeyDown={handleNumericShortcut}
        tabIndex={-1}
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

        <h3
          id="oasis-clarification-title"
          style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 600, color: '#333' }}
        >
          What did you mean?
        </h3>

        <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#666' }}>
          I want to make sure I understand your request correctly. Please pick the best match:
        </p>
        <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#888' }}>
          Click an option or press 1 or 2 on your keyboard.
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
          <button
            type="button"
            onClick={onOpenDirectInput}
            style={{
              padding: '12px 16px',
              border: '1px solid #d9e1b4',
              borderRadius: '8px',
              background: '#F7F9EC',
              color: '#425000',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span style={{ fontWeight: 600, marginRight: '8px', color: '#7A9200' }}>
              3.
            </span>
            None of these
          </button>
        </div>
        {directInputOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <input
              type="text"
              ref={element => {
                element?.focus();
              }}
              value={directInputValue}
              onInput={event => {
                onDirectInputChange((event.currentTarget as HTMLInputElement).value);
              }}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onTellDirectly();
                }
              }}
              placeholder="Tell Oasis what you meant"
              style={{
                padding: '12px 14px',
                border: '1px solid #d8d8d8',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            />
            <button
              type="button"
              aria-label="Send to Oasis"
              disabled={!directInputValue.trim()}
              onClick={onTellDirectly}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderRadius: '8px',
                background: '#7A9200',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: directInputValue.trim() ? 'pointer' : 'default',
                opacity: directInputValue.trim() ? 1 : 0.55,
              }}
            >
              Enter
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
