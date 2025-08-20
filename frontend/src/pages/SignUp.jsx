
import React,{useState} from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import styles from './AuthForm.module.css'

export default function SignUp(){
  const nav=useNavigate()
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [loading,setLoading]=useState(false); const [err,setErr]=useState(null); const [ok,setOk]=useState(null)

  const submit=async(e)=>{
    e.preventDefault(); setLoading(true); setErr(null); setOk(null)
    try{
      await api.post('/auth/sign_up', { email, password })
      setOk('Account created. Please sign in.')
      setTimeout(()=>nav('/auth/sign-in', { replace:true }), 600)
    }catch(e){
      setErr(e?.response?.data?.message || e.message || 'Sign up failed')
    }finally{
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">Create account</h1>
        <p className="subtitle">Sign up to get started</p>
        <form onSubmit={submit} className="stack">
          <label className="hint">Email</label>
          <input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" />
          <label className="hint">Password</label>
          <input className="input" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" />
          {err && <div className={styles.err}>{err}</div>}
          {ok && <div className="hint" style={{color:'#16a34a'}}>{ok}</div>}
          <div className={styles.actions}>
            <button disabled={loading} className="btn">{loading?'Creating...':'Sign up'}</button>
            <div className="hint">Already have an account? <Link className={styles.link} to="/auth/sign-in">Sign in</Link></div>
          </div>
        </form>
      </div>
    </div>
  )
}
