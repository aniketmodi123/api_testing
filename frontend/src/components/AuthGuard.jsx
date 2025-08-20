
import React from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSession } from '../store/session.js'
export default function AuthGuard(){
  const { token } = useSession()
  const loc = useLocation()
  if(!token) return <Navigate to="/auth/sign-in" replace state={{ from: loc.pathname }} />
  return <Outlet />
}
