'use client';

interface LikertScaleProps {
  value: number | null;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const likertOptions = [
  { value: 1, label: 'Strongly Disagree', shortLabel: 'Strongly\nDisagree' },
  { value: 2, label: 'Disagree', shortLabel: 'Disagree' },
  { value: 3, label: 'Neutral', shortLabel: 'Neutral' },
  { value: 4, label: 'Agree', shortLabel: 'Agree' },
  { value: 5, label: 'Strongly Agree', shortLabel: 'Strongly\nAgree' },
];

export function LikertScale({ value, onChange, disabled }: LikertScaleProps) {
  return (
    <div className="flex flex-col items-center gap-4 py-4">
      <div className="flex justify-center gap-2 w-full max-w-2xl">
        {likertOptions.map(({ value: optionValue, label, shortLabel }) => (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            disabled={disabled}
            className={`
              flex-1 flex flex-col items-center justify-center
              min-h-[100px] px-2 py-4 rounded-lg border-2 
              transition-all duration-200
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:scale-105'}
              ${
                value === optionValue
                  ? 'border-blue-500 bg-blue-50 scale-105'
                  : 'border-gray-300 bg-white hover:border-blue-300'
              }
            `}
            aria-label={label}
          >
            <div className="text-4xl font-bold text-gray-700 mb-2">
              {optionValue}
            </div>
            <div className="text-sm text-center text-gray-600 whitespace-pre-line">
              {shortLabel}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
