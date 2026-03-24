/**
 * ProfileButton.tsx — Top-right profile badge with name edit
 *
 * Shows the player's initial in a colored circle + their name.
 * Click to open the name edit popup.
 *
 * @author AK Boys Team
 * @since 2026-03-24
 */

'use client';

import React, { useState } from 'react';
import { NamePopup } from './NamePopup';

interface ProfileButtonProps {
  name: string;
  onNameChange: (name: string) => void;
}

export function ProfileButton({ name, onNameChange }: ProfileButtonProps) {
  const [showEdit, setShowEdit] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowEdit(true)}
        style={{
          position: 'fixed', top: '16px', right: '16px',
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 14px 6px 6px',
          backgroundColor: '#111',
          border: '1px solid #2a2520',
          borderRadius: '24px',
          cursor: 'pointer',
          zIndex: 30,
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
        {/* Avatar */}
        <div style={{
          width: '26px', height: '26px', borderRadius: '50%',
          backgroundColor: '#d4a843',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '12px', fontWeight: 'bold', color: '#0a0a0a',
        }}>
          {name.charAt(0).toUpperCase()}
        </div>

        {/* Name */}
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

        {/* Edit icon */}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5a5545" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
        </svg>
      </button>

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
