'use client';

import { useEffect, useRef } from 'react';

interface Props {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = 'Bekräfta',
  cancelText = 'Avbryt',
  isDestructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 10000, backdropFilter: 'blur(4px)',
      }}
    >
      <div style={{
        background: 'var(--bg-card, #161825)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.06))',
        borderRadius: '16px', padding: '24px', maxWidth: '420px', width: '90%',
        boxShadow: '0 25px 80px rgba(0,0,0,0.5)',
      }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>{title}</h3>
        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary, #a0a3b5)', lineHeight: 1.5, marginBottom: '20px' }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button className="btn btn-sm" onClick={onCancel}>{cancelText}</button>
          <button
            className={`btn btn-sm ${isDestructive ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
