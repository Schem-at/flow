/**
 * ShortcutsModal - Displays available keyboard shortcuts
 */

import { X, Keyboard } from 'lucide-react';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string[];
  description: string;
}

interface ShortcutGroup {
  title: string;
  shortcuts: ShortcutItem[];
}

const isMac = typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0;
const cmdKey = isMac ? '⌘' : 'Ctrl';

const shortcutGroups: ShortcutGroup[] = [
  {
    title: 'Editing',
    shortcuts: [
      { keys: [`${cmdKey}`, 'Z'], description: 'Undo' },
      { keys: [`${cmdKey}`, 'Shift', 'Z'], description: 'Redo' },
      { keys: [`${cmdKey}`, 'C'], description: 'Copy selected nodes' },
      { keys: [`${cmdKey}`, 'V'], description: 'Paste nodes' },
      { keys: [`${cmdKey}`, 'D'], description: 'Duplicate selected node' },
      { keys: ['Delete', '/', 'Backspace'], description: 'Delete selected node' },
    ],
  },
  {
    title: 'Navigation',
    shortcuts: [
      { keys: [`${cmdKey}`, '0'], description: 'Zoom to fit' },
      { keys: ['F'], description: 'Zoom to fit' },
      { keys: ['Space', '+ Drag'], description: 'Pan canvas' },
      { keys: ['Scroll'], description: 'Zoom in/out' },
    ],
  },
  {
    title: 'Selection',
    shortcuts: [
      { keys: ['Click'], description: 'Select node' },
      { keys: ['Shift', '+ Click'], description: 'Multi-select' },
      { keys: ['Drag'], description: 'Box select' },
      { keys: ['Escape'], description: 'Deselect all' },
    ],
  },
  {
    title: 'Nodes',
    shortcuts: [
      { keys: [`${cmdKey}`, 'K'], description: 'Quick add node (command palette)' },
      { keys: ['Double-click'], description: 'Edit code node' },
      { keys: ['Right-click'], description: 'Context menu' },
    ],
  },
  {
    title: 'Panels',
    shortcuts: [
      { keys: [`${cmdKey}`, '/'], description: 'Show shortcuts (this panel)' },
      { keys: ['?'], description: 'Show shortcuts (this panel)' },
    ],
  },
];

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-neutral-900 rounded-xl border border-neutral-700/50 shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Keyboard className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
              <p className="text-xs text-neutral-400">Quick reference for all shortcuts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {shortcutGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-3">
                {group.title}
              </h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between py-2 px-3 rounded-lg bg-neutral-800/50 hover:bg-neutral-800 transition-colors"
                  >
                    <span className="text-sm text-neutral-300">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <span key={keyIndex} className="flex items-center gap-1">
                          <kbd className="px-2 py-1 text-xs font-mono bg-neutral-700 rounded border border-neutral-600 text-neutral-200">
                            {key}
                          </kbd>
                          {keyIndex < shortcut.keys.length - 1 && key !== '/' && shortcut.keys[keyIndex + 1] !== '/' && (
                            <span className="text-neutral-500 text-xs">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-800 bg-neutral-900/50">
          <p className="text-xs text-neutral-500 text-center">
            Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-neutral-700 rounded border border-neutral-600 text-neutral-300">Escape</kbd> to close
          </p>
        </div>
      </div>
    </div>
  );
}
