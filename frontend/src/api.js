
import axios from 'axios'
import { useSession } from './store/session.js'
export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
export const api = axios.create({ baseURL: API_BASE })
api.interceptors.request.use((config)=>{
  const { token, username } = useSession.getState()
  if(token) config.headers['Authorization']=token
  if(username) config.headers['username']=username
  config.headers['accept']='application/json'
  return config
})
