// Render testi için sahte API. Gerçek api.js axios kurup interceptor bağlıyor;
// testin amacı ağ değil, veri geldiğinde JSX'in ayakta kalması.
const sayfali = (data) => ({ data, total: data.length, page: 1, limit: 25, hasMore: false })

export const api = {
  getProducerStatement: async () => ({
    producer: { id: 1, name: 'Test', active: true, regionName: 'Bölge', pricePremiumPct: 5 },
    openingBalance: 500,
    ...sayfali([
      { id: 1, type: 'PRODUCER_DEBT', amount: 1260, direction: 1, occurredAt: '2026-08-26T10:00:00Z',
        note: 'Mal kabul #1', createdBy: 'Operatör', paymentMethod: null, entryId: 1,
        productName: 'Domates', automatic: true, runningBalance: 1760 },
      { id: 2, type: 'PRODUCER_PAYMENT', amount: 1000, direction: -1, occurredAt: '2026-08-26T12:00:00Z',
        note: 'Nakit', createdBy: 'Admin', paymentMethod: 'CASH', entryId: null,
        productName: null, automatic: false, runningBalance: 760 },
    ]),
  }),
  getProducerIntakes: async () => sayfali([
    // Üç fiyat katmanının üçü de + fiyatsız satır + fire farkı
    { id: 1, createdAt: '2026-08-26T10:00:00Z', product: { id: 1, name: 'Domates', icon: '🍅' },
      market: { id: 1, no: 1, name: 'Pazar 1' }, regionName: 'Bölge', unit: 'CASE', source: 'HARVEST',
      weak: false, bQuality: false, disposableCase: false, caseCount: 10,
      purchaseQty: 100, weight: 97, qtyDrift: -3, purchasePricePerKg: 12.6,
      purchasePriceSource: 'PRODUCER_PREMIUM', priceSourceLabel: '+%5 prim', markupPct: 5,
      amount: 1260, ledgerEntryId: 1 },
    { id: 2, createdAt: '2026-08-26T11:00:00Z', product: { id: 2, name: 'Biber', icon: '🌶️' },
      market: { id: 99, no: 99, name: 'ATILAN' }, regionName: 'Bölge', unit: 'CASE', source: 'DISCARD',
      weak: true, bQuality: true, disposableCase: true, caseCount: 5,
      purchaseQty: 40, weight: 40, qtyDrift: 0, purchasePricePerKg: 14,
      purchasePriceSource: 'PRODUCER_SPECIAL', priceSourceLabel: 'Özel fiyat', markupPct: null,
      amount: 560, ledgerEntryId: 2 },
    { id: 3, createdAt: '2026-08-26T12:00:00Z', product: { id: 3, name: 'Salatalık', icon: '🥒' },
      market: { id: 1, no: 1, name: 'Pazar 1' }, regionName: null, unit: 'BUNCH', source: 'HARVEST',
      weak: false, bQuality: false, disposableCase: false, caseCount: 0,
      purchaseQty: null, weight: 50, qtyDrift: null, purchasePricePerKg: null,
      purchasePriceSource: null, priceSourceLabel: 'Fiyatsız', markupPct: null,
      amount: null, ledgerEntryId: null },
  ]),
  getProducerPaymentHistory: async () => sayfali([
    { id: 2, amount: 1000, paymentMethod: 'CASH', occurredAt: '2026-08-26T12:00:00Z',
      note: 'Elden nakit', createdBy: 'Admin',
      producer: { id: 1, name: 'Test Üretici', region: { name: 'Bölge' } } },
    { id: 3, amount: 500, paymentMethod: null, occurredAt: '2026-08-26T13:00:00Z',
      note: null, createdBy: null, producer: { id: 1, name: 'Test Üretici', region: null } },
  ]),
  getUnpricedIntakes: async () => ({
    noPrice: { count: 8, productCount: 1, groups: [{
      productId: 3, productName: 'Salatalık', icon: '🥒', unit: 'CASE', entryCount: 8, producerCount: 3,
      totalQuantity: 1240, firstDate: '2026-08-26T09:00:00Z', lastDate: '2026-08-26T18:00:00Z',
      reason: 'NO_GENERAL_PRICE',
      entries: [{ id: 5, createdAt: '2026-08-26T09:00:00Z', producerId: 1, producerName: 'Test', quantity: 100, unit: 'CASE' }],
    }] },
    noProducer: { count: 2, data: [
      { id: 9, createdAt: '2026-08-26T09:30:00Z', product: { id: 1, name: 'Domates', icon: '🍅' },
        quantity: 60, unit: 'CASE', caseCount: 6 },
    ] },
  }),
  getAdminProducers: async () => [{ id: 1, name: 'Test Üretici', active: true, pricePremiumPct: 5 }],
  getAdminProducts: async () => [{ id: 1, name: 'Domates', icon: '🍅', unit: 'CASE' }],
  getAdminRegions: async () => [{ id: 1, name: 'Bölge' }],
  getPurchasePrices: async () => [{ id: 1, productId: 1, pricePerKg: 12, date: '2026-08-26', inherited: false, updatedAt: '2026-08-26T10:00:00Z', updatedBy: 'Admin' }],
  getProducerPrices: async () => [{ id: 1, producerId: 1, productId: 1, pricePerKg: 14, cancelled: false, date: '2026-08-26', inherited: false, updatedAt: '2026-08-26T10:00:00Z' }],
  getPrices: async () => [{ id: 1, productId: 1, qualityId: null, pricePerKg: 15, date: '2026-08-26', inherited: false, updatedAt: '2026-08-26T10:00:00Z' }],
  getProducerPaymentBalances: async () => [],
  getProducerPaymentSummary: async () => ({ period: {}, totalOutstanding: 0, producersWithBalance: 0,
    totalAdvance: 0, periodIntake: 0, periodPaid: 0, unpricedEntryCount: 0, unpricedProductCount: 0 }),
  logExport: async () => {},
}
export const asList = (r) => (Array.isArray(r) ? r : r?.data ?? [])
export const fetchAllPages = async () => []
export const http = { get: async () => ({ data: null }), post: async () => ({ data: null }) }
export default api
