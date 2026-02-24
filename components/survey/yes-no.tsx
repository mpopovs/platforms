'use client';

interface YesNoProps {
  value: number | null; // 1 = No, 2 = Yes
  onChange: (value: number) => void;
  disabled?: boolean;
  yesLabel?: string;
  noLabel?: string;
}

export function YesNo({ value, onChange, disabled, yesLabel = 'Yes', noLabel = 'No' }: YesNoProps) {
  const options = [
    { value: 2, label: yesLabel, emoji: '✅', color: 'border-green-400 bg-green-50 text-green-700', hoverColor: 'hover:border-green-400 hover:bg-green-50' },
    { value: 1, label: noLabel,  emoji: '❌', color: 'border-red-400 bg-red-50 text-red-700',     hoverColor: 'hover:border-red-400 hover:bg-red-50'   },
  ];

  return (
    <div className="flex justify-center gap-8 py-4 select-none">
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => !disabled && onChange(opt.value)}
            disabled={disabled}
            aria-label={opt.label}
            aria-pressed={isSelected}
            className={[
              'flex flex-col items-center gap-3 rounded-2xl border-2 px-12 py-8 transition-all duration-200',
              disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95',
              isSelected
                ? `${opt.color} border-2 shadow-lg scale-105`
                : `border-gray-200 bg-white ${opt.hoverColor}`,
            ].join(' ')}
          >
            <span className="text-5xl">{opt.emoji}</span>
            <span className={`text-2xl font-bold ${isSelected ? '' : 'text-gray-700'}`}>
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
