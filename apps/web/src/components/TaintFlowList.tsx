import type { TaintFlow } from '@safeskill/shared';

const SEV_COLORS: Record<string, string> = {
  critical: 'border-red-500/30 bg-red-500/5',
  high: 'border-orange-500/30 bg-orange-500/5',
  medium: 'border-yellow-500/30 bg-yellow-500/5',
  low: 'border-gray-500/30 bg-gray-500/5',
};

interface Props {
  flows: TaintFlow[];
}

export function TaintFlowList({ flows }: Props) {
  return (
    <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6">
      <h3 className="text-lg font-semibold mb-1">
        Data Flow Risks
        <span className="text-sm font-normal text-gray-500 ml-2">({flows.length})</span>
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Traces data from sensitive sources through transformations to network sinks.
      </p>

      <div className="space-y-4">
        {flows.slice(0, 10).map((flow, i) => (
          <div key={i} className={`rounded-lg border p-4 ${SEV_COLORS[flow.severity] ?? SEV_COLORS.low}`}>
            {/* Source */}
            <div className="flex items-start gap-2">
              <div className="mt-1 w-2 h-2 rounded-full bg-red-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-300">Source: {flow.source.type}</p>
                <p className="text-xs text-gray-400">{flow.source.description}</p>
                <p className="text-xs text-gray-600">{flow.source.location.file}:{flow.source.location.line}</p>
              </div>
            </div>

            {/* Intermediate steps */}
            {flow.intermediateSteps.map((step, j) => (
              <div key={j} className="flex items-start gap-2 ml-4 mt-2">
                <div className="mt-1.5 text-gray-600 text-xs">↓</div>
                <div>
                  <p className="text-xs text-gray-400">{step.description}</p>
                </div>
              </div>
            ))}

            {/* Sink */}
            <div className="flex items-start gap-2 mt-2">
              <div className="mt-1 w-2 h-2 rounded-full bg-orange-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-orange-300">Sink: {flow.sink.type}</p>
                <p className="text-xs text-gray-400">{flow.sink.description}</p>
                <p className="text-xs text-gray-600">{flow.sink.location.file}:{flow.sink.location.line}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {flows.length > 10 && (
        <p className="mt-4 text-xs text-gray-500 text-center">
          Showing 10 of {flows.length} data flows
        </p>
      )}
    </div>
  );
}
