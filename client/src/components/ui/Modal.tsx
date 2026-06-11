/**
 * Modal - Reusable modal dialog component
 */

import { useEffect, useCallback, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  iconColor?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showCloseButton?: boolean;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  full: 'max-w-full max-h-full sm:max-w-[95vw] sm:max-h-[95vh]',
};

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  iconColor = 'text-neutral-400',
  children,
  size = 'md',
  showCloseButton = true,
}: ModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleEscape]);

  // Prevent keyboard events from propagating to parent (ReactFlow)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Always stop propagation for modals to prevent ReactFlow from capturing keys
    e.stopPropagation();
  }, []);

  if (!isOpen) return null;
  
  const isFullSize = size === 'full';

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center ${isFullSize ? 'p-0 sm:p-4' : 'p-4'}`}
      onKeyDown={handleKeyDown}
      onKeyUp={(e) => e.stopPropagation()}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 modal-backdrop animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`
          relative w-full ${sizeClasses[size]}
          bg-neutral-900 border border-neutral-800/50
          ${isFullSize ? 'rounded-none sm:rounded-2xl h-full sm:h-auto' : 'rounded-2xl'}
          shadow-2xl
          animate-scale-in
          flex flex-col
          ${isFullSize ? 'max-h-full sm:max-h-[90vh]' : 'max-h-[90vh]'}
        `}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className={`flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-neutral-800/50 flex-shrink-0 ${isFullSize ? 'safe-area-top' : ''}`}>
            <div className="flex items-center gap-3 min-w-0">
              {icon && (
                <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-neutral-800/50 ${iconColor} flex-shrink-0`}>
                  {icon}
                </div>
              )}
              <div className="min-w-0">
                {title && (
                  <h2 className="text-base sm:text-lg font-semibold text-white truncate">{title}</h2>
                )}
                {subtitle && (
                  <p className="text-xs sm:text-sm text-neutral-400 truncate">{subtitle}</p>
                )}
              </div>
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="flex items-center justify-center w-10 h-10 sm:w-8 sm:h-8 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

