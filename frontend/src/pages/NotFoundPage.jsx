import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4 text-center">
      <span className="text-6xl mb-4">🌿</span>
      <h1 className="text-3xl font-bold text-text-primary mb-2">404</h1>
      <p className="text-text-muted mb-6">Sayfa bulunamadı</p>
      <Link to="/"><Button>Ana Sayfaya Dön</Button></Link>
    </div>
  )
}
