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

// Border/ring colors per value (1=red … 5=green)
const COLORS: Record<number, { border: string; bg: string; label: string }> = {
  1: { border: 'border-red-400',    bg: 'bg-red-50',    label: 'text-red-500' },
  2: { border: 'border-orange-400', bg: 'bg-orange-50', label: 'text-orange-500' },
  3: { border: 'border-yellow-400', bg: 'bg-yellow-50', label: 'text-yellow-600' },
  4: { border: 'border-lime-400',   bg: 'bg-lime-50',   label: 'text-lime-600' },
  5: { border: 'border-green-400',  bg: 'bg-green-50',  label: 'text-green-600' },
};

export function EmojiScale({ value, onChange, disabled, variant = '5-point' }: EmojiScaleProps) {
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);
  const emojis = variant === '3-point' ? emojis3 : emojis5;

  return (
    <div className="flex justify-center gap-3 py-2 select-none flex-wrap">
      {emojis.map(({ value: emojiValue, emoji, label }) => {
        const isSelected = value === emojiValue;
        const isHovered = hoveredValue === emojiValue;
        const c = COLORS[emojiValue];

        return (
          <button
            key={emojiValue}
            type="button"
            onClick={() => !disabled && onChange(emojiValue)}
            onMouseEnter={() => setHoveredValue(emojiValue)}
            onMouseLeave={() => setHoveredValue(null)}
            disabled={disabled}
            aria-label={label}
            aria-pressed={isSelected}
            className={[
              'flex flex-col items-center gap-2 rounded-2xl border-2 px-3 py-4 transition-all duration-200',
              'w-[72px] sm:w-20',
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95',
              isSelected
                ? `${c.border} ${c.bg} shadow-lg scale-[1.1] ring-2 ring-offset-1 ${c.border.replace('border-', 'ring-')}`
                : isHovered
                ? `${c.border} bg-white shadow-md scale-[1.05]`
                : 'border-gray-200 bg-white hover:shadow-sm',
            ].join(' ')}
          >
            <span className="text-4xl sm:text-5xl leading-none">{emoji}</span>
            <span
              className={[
                'text-[10px] sm:text-xs font-semibold text-center leading-tight',
                isSelected ? c.label : 'text-gray-400',
              ].join(' ')}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

