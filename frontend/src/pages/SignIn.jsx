
import React,{useState} from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useSession } from '../store/session.js'
import styles from './AuthForm.module.css'

export default function SignIn(){
  const nav=useNavigate(); const loc=useLocation(); const { setSession }=useSession()
  const [username,setUsername]=useState(''); const [password,setPassword]=useState('')
  const [loading,setLoading]=useState(false); const [err,setErr]=useState(null)

  const submit=async(e)=>{
    e.preventDefault(); setLoading(true); setErr(null);
    try{
      const res = await api.post('/auth/sign_in', { username, password })
      console.log(res.data?.data.access_token)
      const token = res.data?.data.access_token
      if(!token) throw new Error('No access_token in response')
      setSession({ token, username })
      try{ await api.get('/auth/me', { headers:{ username } }) }catch{}
      nav(loc.state?.from || '/', { replace:true })
    }catch(e){
      setErr(e?.response?.data?.message || e.message || 'Sign in failed')
    }finally{
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">Welcome back</h1>
        <p className="subtitle">Sign in to continue</p>
        <form onSubmit={submit} className="stack">
          <label className="hint">Username</label>
          <input className="input" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" />
          <label className="hint">Password</label>
          <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" />
          {err && <div className={styles.err}>{err}</div>}
          <div className={styles.actions}>
            <button disabled={loading} className="btn">{loading?'Signing in...':'Sign in'}</button>
            <div className="hint">New here? <Link className={styles.link} to="/auth/sign-up">Create account</Link></div>
          </div>
        </form>
      </div>
    </div>
  )
}
