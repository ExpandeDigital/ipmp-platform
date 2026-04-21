'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })

      if (res.ok) {
        router.push('/')
        router.refresh()
      } else {
        setError('Acceso denegado')
        setPassword('')
      }
    } catch {
      setError('Error de conexion')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-6 mb-8">
            <div className="w-24 h-24 rounded-xl overflow-hidden bg-neutral-900 flex items-center justify-center shadow-lg ring-1 ring-neutral-800">
              <Image src="/logos/investigapress.png" alt="InvestigaPress" width={96} height={96} className="object-contain" />
            </div>
            <div className="w-24 h-24 rounded-xl overflow-hidden bg-white flex items-center justify-center shadow-lg ring-1 ring-neutral-800">
              <Image src="/logos/metricpress.png" alt="MetricPress" width={96} height={96} className="object-contain" />
            </div>
          </div>
          <h1 className="text-3xl font-semibold text-white mb-2 tracking-tight">IPMP Platform</h1>
          <p className="text-neutral-400 text-sm">InvestigaPress + MetricPress Pipeline</p>
          <p className="text-neutral-500 text-xs mt-1">Expande Digital Consultores SpA</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 shadow-2xl">
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Clave de acceso
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            disabled={loading}
            className="w-full px-4 py-3 bg-neutral-950 border border-neutral-800 rounded-lg text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            placeholder="Ingresa tu clave"
          />

          {error && (
            <p className="mt-3 text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="mt-5 w-full py-3 bg-emerald-500 hover:bg-emerald-400 disabled:bg-neutral-700 disabled:cursor-not-allowed text-neutral-950 font-semibold rounded-lg transition"
          >
            {loading ? 'Verificando...' : 'Ingresar'}
          </button>
        </form>

        <p className="text-center text-neutral-600 text-xs mt-8">
          Acceso restringido. Uso exclusivo interno.
        </p>
      </div>
    </div>
  )
}
