
import React from 'react'
import Header from './components/Header.jsx'
export default function App({ children }){
  return (<>
    <Header />
    <main style={{display:'grid',placeItems:'center',padding:'16px'}}>{children}</main>
  </>)
}
