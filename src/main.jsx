import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { seedIfNeeded } from './data/store'
import { pullFromGist, storeGistId } from './data/sync'
import 'animate.css'
import './index.css'

seedIfNeeded()

const params = new URLSearchParams(window.location.search)
const gistFromUrl = params.get('gist_id')
if (gistFromUrl) {
  storeGistId(gistFromUrl)
  pullFromGist()
  const url = new URL(window.location)
  url.searchParams.delete('gist_id')
  window.history.replaceState({}, '', url)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
