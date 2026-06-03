import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { initStore } from './data/store'
import { initAuth } from './data/auth'
import { ImpersonationProvider } from './context/ImpersonationContext'
import 'animate.css'
import './index.css'

async function init() {
  const data = await initStore()
  if (data) console.log('Campaign data loaded')
  await initAuth()
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <ImpersonationProvider>
          <App />
        </ImpersonationProvider>
      </BrowserRouter>
    </React.StrictMode>
  )
}

init()
