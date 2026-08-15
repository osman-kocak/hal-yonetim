// Admin tablolarının ortak sayfalama çubuğu. HistoryPage'deki satır içi sürümden
// çıkarıldı — beş sayfada daha lazım oldu, kopyalamak yerine tek yerde durur.
// Tek sayfalık sonuçta hiç render edilmez (total <= pageSize).
export function Pagination({ page, total, pageSize, hasMore, onChange, className = '' }) {
  if (!total || total <= pageSize) return null

  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className={`flex items-center justify-between mt-4 bg-white border border-border rounded-2xl p-3 ${className}`}>
      <span className="text-sm text-text-muted">
        Sayfa <span className="font-semibold text-text-primary">{page}</span> /{' '}
        <span className="font-semibold">{pageCount}</span>
        {' · '}Toplam <span className="font-semibold">{total}</span> kayıt
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Önceki
        </button>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={!hasMore}
          className="px-3 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Sonraki →
        </button>
      </div>
    </div>
  )
}
