
import React from 'react'
import { useTheme } from './ThemeProvider.jsx'
export default function Header(){
  const { theme, setTheme } = useTheme()
  return (
    <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px'}}>
      <div style={{fontWeight:700}}>Auth Starter</div>
      <button className="btn" onClick={()=>setTheme(theme==='light'?'dark':'light')}>
        {theme==='light'?'Dark':'Light'} mode
      </button>
    </header>
  )
}
