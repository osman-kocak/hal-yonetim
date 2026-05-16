import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/services/api'
import { useAuthStore } from '@/store/authStore'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'

export function DepoLoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    if (!username || !password) { setError('Kullanıcı adı ve şifre zorunludur'); return }
    setError('')
    setLoading(true)
    try {
      const { token, user } = await api.adminLogin(username, password)
      if (user.role !== 'DEPO' && user.role !== 'ADMIN') {
        setError('Bu giriş depo personeli içindir.')
        setLoading(false)
        return
      }
      login(token, user)
      navigate('/depo')
    } catch (err) {
      setError(err.response?.data?.error ?? 'Giriş başarısız')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="bg-white border border-border rounded-2xl shadow-card p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="text-4xl">📦</span>
          <h1 className="text-xl font-bold text-text-primary mt-3">Depo Girişi</h1>
          <p className="text-sm text-text-muted mt-1">Hal Yönetim Sistemi</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Kullanıcı Adı"
            type="text"
            placeholder="depo1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <Input
            label="Şifre"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error}
          />
          <Button type="submit" size="lg" loading={loading} className="w-full mt-2">
            Giriş Yap
          </Button>
        </form>
      </div>
    </div>
  )
}
