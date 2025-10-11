import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const ToastContext = createContext({
  showToast: () => {},
});

const AUTO_DISMISS_MS = 3000;

const toneClasses = {
  success: 'border-green-200 bg-green-50 text-green-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((existing) => existing.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, tone = 'info' }) => {
      if (!message) {
        return;
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setToasts((existing) => [
        ...existing,
        {
          id,
          message,
          tone,
        },
      ]);

      setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
    },
    [removeToast]
  );

  const contextValue = useMemo(
    () => ({
      showToast,
    }),
    [showToast]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => {
          const toneClass = toneClasses[toast.tone] || toneClasses.info;
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-md border px-4 py-3 text-sm shadow-lg transition ${toneClass}`}
              role="status"
              aria-live="assertive"
            >
              {toast.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => useContext(ToastContext);

export default ToastProvider;
