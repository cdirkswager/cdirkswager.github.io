async function api(path, options = {}) {
  const { body, method = 'GET', headers = {}, useApiKey } = options
  const h = { 'Content-Type': 'application/json', ...headers }
  if (useApiKey) {
    try { h['X-API-Key'] = import.meta.env.VITE_API_KEY } catch {}
  }
  try {
    const res = await fetch('/api' + path, {
  method,
  headers: h,
  credentials: 'include',
  ...(body ? { body: JSON.stringify(body) } : {}),
})
    const data = await res.json()
    if (!res.ok && !data.ok) return { ok: false, error: data.error || `HTTP ${res.status}` }
    return data
  } catch (e) {
    return { ok: false, error: e.message || 'Network error' }
  }
}

export function get(path, headers) {
  return api(path, { headers })
}

export function post(path, body, headers) {
  return api(path, { method: 'POST', body, headers })
}

export function put(path, body, headers) {
  return api(path, { method: 'PUT', body, headers })
}

export function del(path, headers) {
  return api(path, { method: 'DELETE', headers })
}

export async function uploadImage(file, playerId) {
  const formData = new FormData()
  formData.append('file', file)
  if (playerId) formData.append('playerId', playerId)
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error || `HTTP ${res.status}` }
    return data
  } catch (e) {
    return { ok: false, error: e.message || 'Upload failed' }
  }
}

export default api
