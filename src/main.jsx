import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { initStore } from './data/store'
import { initAuth } from './data/auth'
import 'animate.css'
import './index.css'

async function init() {
  const data = await initStore()
  if (data) console.log('Campaign data loaded')
  await initAuth()
}

init()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
