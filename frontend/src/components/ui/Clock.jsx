import { useState, useEffect } from 'react'

const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

export function Clock({ className = '' }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const day = DAYS[now.getDay()]
  const date = now.toLocaleDateString('tr-TR')
  const time = now.toLocaleTimeString('tr-TR')

  return (
    <div className={`text-right text-sm leading-tight tabular-nums ${className}`}>
      <div className="font-semibold text-text-primary">{day}</div>
      <div className="text-text-muted">{date} · {time}</div>
    </div>
  )
}
