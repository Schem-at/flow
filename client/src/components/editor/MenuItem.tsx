import type { ReactNode } from 'react';

/** A single row in the editor's menu dropdowns — icon, label, optional shortcut. */
export function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
  disabled,
  title,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="w-full text-left px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800 hover:text-white flex items-center gap-2.5 justify-between transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span className="flex items-center gap-2.5">{icon}{label}</span>
      {shortcut && <span className="text-xs text-neutral-600 font-mono">{shortcut}</span>}
    </button>
  );
}
