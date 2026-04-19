import { createContext, useContext, useState, useCallback } from 'react'

interface ToastState { message: string; ok: boolean; visible: boolean }
interface ToastCtx { toast: (msg: string, ok?: boolean) => void }

const Ctx = createContext<ToastCtx>({ toast: () => {} })

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [t, setT] = useState<ToastState>({ message: '', ok: true, visible: false })

  const toast = useCallback((message: string, ok = true) => {
    setT({ message, ok, visible: true })
    setTimeout(() => setT(s => ({ ...s, visible: false })), 3500)
  }, [])

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      {t.visible && (
        <div
          className={`fixed bottom-6 right-6 z-[100] px-4 py-3 rounded-xl text-sm font-semibold shadow-2xl transition-all pointer-events-none
            ${t.ok ? 'bg-white text-black' : 'bg-red-500 text-white'}`}
        >
          {t.message}
        </div>
      )}
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx).toast
