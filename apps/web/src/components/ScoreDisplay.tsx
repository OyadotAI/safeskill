import { SCORE_THRESHOLDS, GRADE_LABELS, GRADE_COLORS, getGrade } from '@safeskill/shared';

interface ScoreDisplayProps {
  score: number;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ScoreDisplay({ score, label, size = 'md' }: ScoreDisplayProps) {
  const grade = getGrade(score);
  const gradeLabel = GRADE_LABELS[grade];
  const color = GRADE_COLORS[grade];

  const sizes = {
    sm: { ring: 64, stroke: 4, text: 'text-lg', label: 'text-xs' },
    md: { ring: 96, stroke: 5, text: 'text-3xl', label: 'text-sm' },
    lg: { ring: 128, stroke: 6, text: 'text-4xl', label: 'text-base' },
  };

  const s = sizes[size];
  const radius = (s.ring - s.stroke * 2) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: s.ring, height: s.ring }}>
        <svg
          width={s.ring}
          height={s.ring}
          viewBox={`0 0 ${s.ring} ${s.ring}`}
          className="-rotate-90"
        >
          {/* Background ring */}
          <circle
            cx={s.ring / 2}
            cy={s.ring / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={s.stroke}
            className="text-gray-800"
          />
          {/* Score ring */}
          <circle
            cx={s.ring / 2}
            cy={s.ring / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={s.stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
          />
        </svg>
        {/* Score number */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`${s.text} font-bold`} style={{ color }}>
            {score}
          </span>
        </div>
      </div>

      {/* Labels */}
      <div className="text-center">
        {label && <p className={`${s.label} font-medium text-gray-300`}>{label}</p>}
        <p className="text-xs text-gray-500">{gradeLabel}</p>
      </div>
    </div>
  );
}
