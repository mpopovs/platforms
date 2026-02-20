'use client';

import { SurveyTranslations } from './locales';

interface LikertScaleProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
  translations?: Pick<SurveyTranslations, 'stronglyDisagree' | 'disagree' | 'neutral' | 'agree' | 'stronglyAgree'>;
}

const OPTION_VALUES = [1, 2, 3, 4, 5];

// bg color when selected (unselected = white)
const COLORS = {
  bg: ['bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-lime-500', 'bg-green-500'],
  ring: ['ring-red-400', 'ring-orange-300', 'ring-yellow-300', 'ring-lime-400', 'ring-green-400'],
  dot: ['bg-red-500', 'bg-orange-400', 'bg-yellow-400', 'bg-lime-500', 'bg-green-500'],
};

export function LikertScale({ value, onChange, disabled, translations }: LikertScaleProps) {
  const t = translations ?? {
    stronglyDisagree: 'Strongly\nDisagree',
    disagree: 'Disagree',
    neutral: 'Neutral',
    agree: 'Agree',
    stronglyAgree: 'Strongly\nAgree',
  };

  const labels = [t.stronglyDisagree, t.disagree, t.neutral, t.agree, t.stronglyAgree];

  return (
    <div className="w-full select-none">
      {/* Progress bar track */}
      <div className="relative h-1.5 rounded-full bg-gray-100 mx-[10%] mb-5">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-300"
          style={{
            width: value ? `${((value - 1) / 4) * 100}%` : '0%',
            background: value
              ? 'linear-gradient(to right, #ef4444, #f97316, #facc15, #84cc16, #22c55e)'
              : 'transparent',
          }}
        />
        {/* Dot markers */}
        {OPTION_VALUES.map((v, i) => (
          <div
            key={v}
            className={[
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 border-white transition-all duration-200',
              value !== null && value >= v ? COLORS.dot[i] : 'bg-gray-200',
            ].join(' ')}
            style={{ left: `${(i / 4) * 100}%` }}
          />
        ))}
      </div>

      {/* Button row */}
      <div className="flex gap-1.5">
        {OPTION_VALUES.map((optionValue, i) => {
          const isSelected = value === optionValue;
          return (
            <button
              key={optionValue}
              type="button"
              onClick={() => !disabled && onChange(optionValue)}
              disabled={disabled}
              aria-label={labels[i].replace('\n', ' ')}
              aria-pressed={isSelected}
              className={[
                'flex-1 flex flex-col items-center gap-2 py-3 px-1',
                'rounded-2xl border-2 transition-all duration-200',
                disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95',
                isSelected
                  ? `${COLORS.bg[i]} border-transparent shadow-lg scale-[1.08] ring-2 ring-offset-1 ${COLORS.ring[i]}`
                  : 'border-gray-100 bg-gray-50 hover:bg-white hover:border-gray-300 hover:shadow-sm',
              ].join(' ')}
            >
              {/* Number */}
              <span
                className={[
                  'text-xl font-black leading-none',
                  isSelected ? 'text-white' : 'text-gray-500',
                ].join(' ')}
              >
                {optionValue}
              </span>
              {/* Label text: all 5 visible, wraps naturally */}
              <span
                className={[
                  'text-[9px] font-semibold text-center leading-tight whitespace-pre-line',
                  isSelected ? 'text-white/90' : 'text-gray-400',
                ].join(' ')}
              >
                {labels[i]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
