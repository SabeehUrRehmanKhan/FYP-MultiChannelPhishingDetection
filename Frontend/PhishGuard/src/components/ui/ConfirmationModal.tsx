import { AlertCircle, X } from 'lucide-react';
import { GlassCard } from './UIComponents';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false
}: ConfirmationModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <GlassCard className="max-w-md w-full relative animate-slide-in shadow-2xl overflow-hidden border border-outline-variant/40">
        
        {/* Header Icon / Accent */}
        <div className={`h-2 w-full absolute top-0 left-0 ${danger ? 'bg-neon-red' : 'bg-electric-blue'}`} />
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <X size={20} />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className={`p-3 rounded-xl ${danger ? 'bg-neon-red/10 text-neon-red' : 'bg-electric-blue/10 text-electric-blue'}`}>
              <AlertCircle size={28} />
            </div>
            <h2 className="text-xl font-headline font-bold text-on-surface">{title}</h2>
          </div>
          
          <p className="text-on-surface-variant leading-relaxed mb-8">
            {message}
          </p>
          
          <div className="flex gap-4 justify-end">
            <button 
              onClick={onClose}
              className="btn btn-ghost px-6 py-2"
            >
              {cancelText}
            </button>
            <button 
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={`btn px-6 py-2 ${danger ? 'btn-danger shadow-lg shadow-neon-red/20' : 'btn-primary shadow-lg shadow-electric-blue/20'}`}
            >
              {confirmText}
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
