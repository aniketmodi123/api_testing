
import { create } from 'zustand'
const saved = typeof window!=='undefined' ? JSON.parse(localStorage.getItem('session')||'{}') : {}
export const useSession = create((set)=>({
  token: saved.token || null,
  username: saved.username || null,
  profile: saved.profile || null,
  setSession: (patch)=>set((s)=>{ const next={...s,...patch}; if(typeof window!=='undefined') localStorage.setItem('session', JSON.stringify(next)); return next }),
  clearSession: ()=>set(()=>{ if(typeof window!=='undefined') localStorage.removeItem('session'); return {token:null,username:null,profile:null} })
}))
