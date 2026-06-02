import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { seedIfNeeded } from './data/store'
import { pullFromWorker, testConnection, getApiKey } from './data/sync'
import 'animate.css'
import './index.css'

seedIfNeeded()

async function initSync() {
  const envUrl = import.meta.env.VITE_WORKER_URL
  const envKey = import.meta.env.VITE_API_KEY
  const params = new URLSearchParams(window.location.search)
  const workerUrl = params.get('worker') || envUrl
  if (workerUrl && getApiKey()) {
    await pullFromWorker()
  } else if (workerUrl && envKey) {
    const result = await testConnection(workerUrl, envKey)
    if (result.ok) await pullFromWorker()
  }
  if (params.has('worker')) {
    const url = new URL(window.location)
    url.searchParams.delete('worker')
    window.history.replaceState({}, '', url)
  }
}
initSync()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
