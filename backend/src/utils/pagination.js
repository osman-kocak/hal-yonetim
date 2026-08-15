// Sayfalama — işlem verisi tutan tüm listeler bunu kullanır. Tek yerde durmasının
// sebebi: her controller kendi limitini uydurursa bir tanesi unutulup tüm tabloyu
// çeker ve veri büyüdükçe o endpoint sessizce yavaşlar.
//
// Yanıt biçimi: { data, total, page, limit, hasMore }
// Frontend eski (düz dizi) biçimi de kabul ediyor — deploy sırasında backend ile
// frontend arasında sürüm farkı oluşursa ekran boş kalmasın diye.

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export function parsePagination(req, { defaultLimit = DEFAULT_LIMIT } = {}) {
  const page = Math.max(1, Number(req.query.page) || 1)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || defaultLimit))
  return { page, limit, skip: (page - 1) * limit }
}

export function paginated(data, total, { page, limit, skip }) {
  return { data, total, page, limit, hasMore: skip + data.length < total }
}
