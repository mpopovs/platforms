'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';

interface StarRatingProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function StarRating({ value, onChange, disabled }: StarRatingProps) {
  const [hoveredValue, setHoveredValue] = useState<number | null>(null);

  const displayValue = hoveredValue ?? value ?? 0;

  return (
    <div className="flex justify-center gap-2 py-4">
      {[1, 2, 3, 4, 5].map((starValue) => (
        <button
          key={starValue}
          type="button"
          onClick={() => onChange(starValue)}
          onMouseEnter={() => setHoveredValue(starValue)}
          onMouseLeave={() => setHoveredValue(null)}
          disabled={disabled}
          className={`
            transition-all duration-200
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-110'}
            ${value === starValue ? 'scale-110' : ''}
          `}
          aria-label={`${starValue} star${starValue !== 1 ? 's' : ''}`}
        >
          <Star
            className={`h-16 w-16 ${
              starValue <= displayValue
                ? 'fill-yellow-400 text-yellow-400'
                : 'fill-none text-gray-300'
            }`}
          />
        </button>
      ))}
    </div>
  );
}
