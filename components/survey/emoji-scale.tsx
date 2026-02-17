'use client';

import { useState } from 'react';

interface EmojiScaleProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
  variant?: '3-point' | '5-point';
}

const emojis5 = [
  { value: 1, emoji: '😢', label: 'Very Sad' },
  { value: 2, emoji: '😟', label: 'Sad' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 4, emoji: '😊', label: 'Happy' },
  { value: 5, emoji: '😄', label: 'Very Happy' },
];

const emojis3 = [
  { value: 1, emoji: '😢', label: 'Sad' },
  { value: 3, emoji: '😐', label: 'Okay' },
  { value: 5, emoji: '😄', label: 'Happy' },
];

export function EmojiScale({ value, onChange, disabled, variant = '5-point' }: EmojiScaleProps) {
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);

  // If using existing values that don't match our stepped values (e.g. 2 or 4),
  // we need to make sure the UI still responds somewhat sanely, 
  // but preferably we stick to 1, 3, 5 for 3-point.

  const emojis = variant === '3-point' ? emojis3 : emojis5;

  return (
    <div className="flex justify-center gap-4 py-4">
      {emojis.map(({ value: emojiValue, emoji, label }) => (
        <button
          key={emojiValue}
          type="button"
          onClick={() => onChange(emojiValue)}
          onMouseEnter={() => setHoveredValue(emojiValue)}
          onMouseLeave={() => setHoveredValue(null)}
          disabled={disabled}
          className={`
            text-6xl transition-all duration-200 
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-125'}
            ${value === emojiValue ? 'scale-125' : ''}
            ${hoveredValue === emojiValue && value !== emojiValue ? 'scale-110' : ''}
          `}
          aria-label={label}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
