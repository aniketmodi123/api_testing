
import React,{createContext,useContext,useEffect,useState} from 'react'
const ThemeCtx=createContext({theme:'light',setTheme:()=>{}})
export function ThemeProvider({children}){
  const [theme,setTheme]=useState(()=>localStorage.getItem('theme')||'light')
  useEffect(()=>{document.documentElement.setAttribute('data-theme',theme);localStorage.setItem('theme',theme)},[theme])
  return <ThemeCtx.Provider value={{theme,setTheme}}>{children}</ThemeCtx.Provider>
}
export function useTheme(){ return useContext(ThemeCtx) }
