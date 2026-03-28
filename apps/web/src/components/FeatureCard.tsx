interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  details: string[];
}

export function FeatureCard({ icon, title, description, details }: FeatureCardProps) {
  return (
    <div className="group relative rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6 sm:p-8 hover:border-emerald-500/30 hover:bg-gray-900/80 transition-all duration-300">
      {/* Subtle gradient on hover */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <div className="relative">
        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-5 group-hover:bg-emerald-500/15 transition-colors">
          {icon}
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-gray-50 mb-2">{title}</h3>

        {/* Description */}
        <p className="text-sm text-gray-400 mb-4 leading-relaxed">{description}</p>

        {/* Detail chips */}
        <div className="flex flex-wrap gap-2">
          {details.map((detail) => (
            <span
              key={detail}
              className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-800/80 text-xs text-gray-400 border border-gray-700/50"
            >
              {detail}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
