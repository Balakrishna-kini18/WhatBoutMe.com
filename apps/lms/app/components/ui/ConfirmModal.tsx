'use client';

import React, { useEffect, useCallback } from 'react';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'Are you sure you want to permanently delete this note? This action cannot be undone.',
  confirmText = 'Permanently Delete',
  cancelText = 'Cancel',
  tone = 'danger',
  isLoading = false,
}: ConfirmModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    },
    [isLoading, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const toneConfig = {
    danger: {
      badgeBg: '#fef2f2',
      badgeBorder: '#fee2e2',
      badgeColor: '#dc2626',
      btnBg: '#dc2626',
      btnHover: '#b91c1c',
      btnShadow: '0 2px 8px rgba(220, 38, 38, 0.25)',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </svg>
      ),
    },
    warning: {
      badgeBg: '#fffbeb',
      badgeBorder: '#fef3c7',
      badgeColor: '#d97706',
      btnBg: '#ea580c',
      btnHover: '#c2410c',
      btnShadow: '0 2px 8px rgba(234, 88, 12, 0.25)',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      ),
    },
    info: {
      badgeBg: '#eff6ff',
      badgeBorder: '#dbeafe',
      badgeColor: '#2563eb',
      btnBg: '#2563eb',
      btnHover: '#1d4ed8',
      btnShadow: '0 2px 8px rgba(37, 99, 235, 0.25)',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      ),
    },
  }[tone];

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-description"
      onClick={() => {
        if (!isLoading) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '1rem',
        animation: 'confirmFadeIn 0.15s ease-out',
      }}
    >
      <style>{`
        @keyframes confirmFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes confirmPopIn {
          from { opacity: 0; transform: scale(0.95) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#ffffff',
          borderRadius: 20,
          border: '1px solid #e5e7eb',
          boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.12), 0 10px 15px -5px rgba(0, 0, 0, 0.05)',
          maxWidth: 460,
          width: '100%',
          padding: '1.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          animation: 'confirmPopIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: toneConfig.badgeBg,
              border: `1px solid ${toneConfig.badgeBorder}`,
              color: toneConfig.badgeColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {toneConfig.icon}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              id="confirm-modal-title"
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 700,
                color: '#0f172a',
                lineHeight: 1.35,
              }}
            >
              {title}
            </h3>
            <div
              id="confirm-modal-description"
              style={{
                marginTop: '0.45rem',
                fontSize: '0.88rem',
                color: '#64748b',
                lineHeight: 1.5,
              }}
            >
              {message}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            paddingTop: '0.5rem',
            borderTop: '1px solid #f1f5f9',
          }}
        >
          <button
            type="button"
            disabled={isLoading}
            onClick={onClose}
            style={{
              padding: '0.55rem 1.15rem',
              borderRadius: 10,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#475569',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isLoading) (e.currentTarget.style.background = '#f8fafc');
            }}
            onMouseLeave={(e) => {
              if (!isLoading) (e.currentTarget.style.background = '#ffffff');
            }}
          >
            {cancelText}
          </button>

          <button
            type="button"
            disabled={isLoading}
            onClick={async () => {
              await onConfirm();
            }}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: 10,
              border: 'none',
              background: toneConfig.btnBg,
              color: '#ffffff',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.75 : 1,
              boxShadow: toneConfig.btnShadow,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!isLoading) (e.currentTarget.style.background = toneConfig.btnHover);
            }}
            onMouseLeave={(e) => {
              if (!isLoading) (e.currentTarget.style.background = toneConfig.btnBg);
            }}
          >
            {isLoading && (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                style={{
                  animation: 'confirmSpin 1s linear infinite',
                }}
              >
                <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
              </svg>
            )}
            <style>{`
              @keyframes confirmSpin {
                100% { transform: rotate(360deg); }
              }
            `}</style>
            {isLoading ? 'Deleting...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
export default ConfirmModal;
