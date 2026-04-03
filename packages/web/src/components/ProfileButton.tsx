/**
 * ProfileButton.tsx — Top-right profile badge with name edit
 *
 * Shows the player's initial in a colored circle + their name.
 * Click to open the name edit popup.
 *
 * @author AKBOYS Team
 * @since 2026-03-24
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { NamePopup } from './NamePopup';

interface ProfileButtonProps {
  name: string;
  onNameChange: (name: string) => void;
  onSignOut?: () => Promise<void> | void;
}

export function ProfileButton({ name, onNameChange, onSignOut }: ProfileButtonProps) {
  const [showEdit, setShowEdit] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showMenu]);

  return (
    <>
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          zIndex: 30,
        }}
      >
        <button
          onClick={() => setShowMenu((prev) => !prev)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '6px 14px 6px 6px',
            backgroundColor: '#111',
            border: '1px solid #2a2520',
            borderRadius: '24px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#3a3020';
            e.currentTarget.style.backgroundColor = '#151210';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#2a2520';
            e.currentTarget.style.backgroundColor = '#111';
          }}
        >
          <div style={{
            width: '26px', height: '26px', borderRadius: '50%',
            backgroundColor: '#d4a843',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', fontWeight: 'bold', color: '#0a0a0a',
          }}>
            {name.charAt(0).toUpperCase()}
          </div>

          <span style={{
            fontSize: '13px', color: '#9a9080',
            fontFamily: 'monospace',
            maxWidth: '120px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {name}
          </span>

          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5a5545" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>

        {showMenu && (
          <div style={{
            position: 'absolute',
            top: '44px',
            right: 0,
            minWidth: '180px',
            backgroundColor: '#111',
            border: '1px solid #2a2520',
            borderRadius: '14px',
            overflow: 'hidden',
            boxShadow: '0 12px 36px rgba(0,0,0,0.35)',
          }}>
            <button
              onClick={() => {
                setShowMenu(false);
                setShowEdit(true);
              }}
              style={menuButtonStyle}
            >
              Edit display name
            </button>

            {onSignOut && (
              <button
                onClick={async () => {
                  setShowMenu(false);
                  await onSignOut();
                }}
                style={{
                  ...menuButtonStyle,
                  color: '#d88b73',
                  borderTop: '1px solid #2a2520',
                }}
              >
                Sign out
              </button>
            )}
          </div>
        )}
      </div>

      {showEdit && (
        <NamePopup
          currentName={name}
          isEdit
          onSave={(newName) => {
            onNameChange(newName);
            setShowEdit(false);
          }}
          onClose={() => setShowEdit(false)}
        />
      )}
    </>
  );
}

const menuButtonStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  backgroundColor: 'transparent',
  border: 'none',
  color: '#e8e0d4',
  textAlign: 'left',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontSize: '13px',
};
