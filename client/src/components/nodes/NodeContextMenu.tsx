import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreVertical } from 'lucide-react';
import { ReactNode } from 'react';

interface NodeContextMenuProps {
  children: ReactNode;
}

export function NodeContextMenu({ children }: NodeContextMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button 
          className="p-1 hover:bg-neutral-700 rounded text-neutral-400 hover:text-white transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          onClick={(e) => e.stopPropagation()}
          title="Node settings"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content 
          className="min-w-[160px] bg-neutral-900 border border-neutral-800 rounded-lg p-1 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100"
          sideOffset={5}
          align="end"
        >
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function NodeContextMenuItem({ 
  children, 
  onClick, 
  icon: Icon,
  checked,
  destructive
}: { 
  children: ReactNode; 
  onClick?: () => void;
  icon?: any;
  checked?: boolean;
  destructive?: boolean;
}) {
  return (
    <DropdownMenu.Item 
      className={`
        flex items-center gap-2 px-2 py-1.5 text-xs rounded outline-none cursor-pointer select-none
        ${destructive 
          ? 'text-red-400 hover:bg-red-900/20 hover:text-red-300' 
          : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
        }
      `}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
    >
      {Icon && <Icon className={`w-3.5 h-3.5 ${destructive ? 'text-red-500' : 'text-neutral-500'}`} />}
      <span className="flex-1">{children}</span>
      {checked && <div className="w-1.5 h-1.5 rounded-full bg-pink-500" />}
    </DropdownMenu.Item>
  );
}

export function NodeContextMenuSeparator() {
  return <DropdownMenu.Separator className="h-px bg-neutral-800 my-1" />;
}
