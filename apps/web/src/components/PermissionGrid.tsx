import type { PermissionManifest } from '@safeskill/shared';

interface Props {
  permissions: PermissionManifest;
}

function PermSection({
  icon,
  title,
  items,
  danger,
}: {
  icon: React.ReactNode;
  title: string;
  items: string[];
  danger?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <div className={`rounded-lg border p-4 ${danger ? 'border-red-500/20 bg-red-500/5' : 'border-gray-800/50 bg-gray-950/30'}`}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4 className="text-sm font-medium">{title}</h4>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${danger ? 'bg-red-500/10 text-red-400' : 'bg-gray-800 text-gray-400'}`}>
          {items.length}
        </span>
      </div>
      <ul className="space-y-1">
        {items.slice(0, 8).map((item, i) => (
          <li key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
            <span className={`mt-1.5 w-1 h-1 rounded-full shrink-0 ${danger ? 'bg-red-400' : 'bg-gray-600'}`} />
            <span className="break-all">{item}</span>
          </li>
        ))}
        {items.length > 8 && (
          <li className="text-xs text-gray-600">+ {items.length - 8} more</li>
        )}
      </ul>
    </div>
  );
}

export function PermissionGrid({ permissions }: Props) {
  const hasAnything =
    permissions.filesystem.read.length > 0 ||
    permissions.filesystem.write.length > 0 ||
    permissions.filesystem.delete.length > 0 ||
    permissions.network.outbound.length > 0 ||
    permissions.network.inbound ||
    permissions.environment.variables.length > 0 ||
    permissions.environment.bulkAccess ||
    permissions.process.spawn ||
    permissions.system.crypto ||
    permissions.system.installScripts.length > 0;

  return (
    <div className="rounded-2xl border border-gray-800/80 bg-gray-900/50 p-6">
      <h3 className="text-lg font-semibold mb-1">Permission Manifest</h3>
      <p className="text-xs text-gray-500 mb-4">Inferred from code analysis — what this package accesses.</p>

      {!hasAnything ? (
        <p className="text-sm text-gray-500 py-4">
          <span className="text-emerald-400 mr-1.5">✓</span>
          No dangerous permissions detected. This package appears minimal.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PermSection
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-yellow-400"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>}
            title="Filesystem Read"
            items={permissions.filesystem.read}
          />
          <PermSection
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>}
            title="Filesystem Write"
            items={permissions.filesystem.write}
            danger
          />
          <PermSection
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-orange-400"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>}
            title="Network Outbound"
            items={permissions.network.outbound}
            danger={permissions.network.outbound.length > 0}
          />
          <PermSection
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-purple-400"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>}
            title="Environment Variables"
            items={[
              ...permissions.environment.variables,
              ...(permissions.environment.bulkAccess ? ['(bulk access to all env vars)'] : []),
            ]}
            danger={permissions.environment.variables.length > 0}
          />
          {permissions.process.spawn && (
            <PermSection
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>}
              title="Process Execution"
              items={permissions.process.commands.length > 0 ? permissions.process.commands : ['Spawns child processes']}
              danger
            />
          )}
          {permissions.system.installScripts.length > 0 && (
            <PermSection
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>}
              title="Install Scripts"
              items={permissions.system.installScripts}
              danger
            />
          )}
        </div>
      )}
    </div>
  );
}
