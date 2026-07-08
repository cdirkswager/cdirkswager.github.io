import { createContext, useContext, useState, useCallback } from 'react'

const ImpersonationContext = createContext(null)

export function ImpersonationProvider({ children }) {
  const [impersonating, setImpersonating] = useState(null)

  const loginAs = useCallback((npc) => {
    setImpersonating({ id: npc.id, name: npc.name })
  }, [])

  const logoutAs = useCallback(() => {
    setImpersonating(null)
  }, [])

  return (
    <ImpersonationContext.Provider value={{ impersonating, loginAs, logoutAs }}>
      {children}
    </ImpersonationContext.Provider>
  )
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext)
  if (!ctx) throw new Error('useImpersonation must be used within ImpersonationProvider')
  return ctx
}