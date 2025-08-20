
import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './styles/global.css'
import { ThemeProvider } from './components/ThemeProvider.jsx'
import App from './App.jsx'
import SignIn from './pages/SignIn.jsx'
import SignUp from './pages/SignUp.jsx'
import AuthGuard from './components/AuthGuard.jsx'

function Home(){
  return <div className="card"><div className="title">Home</div><div className="subtitle">Protected area (after sign in)</div></div>
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/auth/sign-in" element={<App><SignIn /></App>} />
          <Route path="/auth/sign-up" element={<App><SignUp /></App>} />
          <Route element={<AuthGuard />}>
            <Route path="/" element={<App><Home /></App>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>
)
