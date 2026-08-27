// Alış fiyatı sızıntı korumasının testi.
//
// Kabul kriteri #1: alış fiyatı hiçbir saha rolüne sızmamalı. Bu test o
// güvenceyi kod seviyesinde tutuyor — guard bozulursa CI'da patlar, sahada
// değil (sahada patlamaz, sessizce sızar; asıl tehlike bu).

import test from 'node:test'
import assert from 'node:assert/strict'
import { hidePurchasePrices } from '../src/middleware/purchaseGuard.js'

// res.json'u sarmalayan middleware'i tek satırda çalıştıran yardımcı
function through(body) {
  let captured
  const res = { json: (b) => { captured = b } }
  hidePurchasePrices({}, res, () => {})
  res.json(body)
  return captured
}

test('düz Entry nesnesinden alış alanları silinir', () => {
  const out = through({
    id: 1, weight: 100, productId: 12,
    purchasePricePerKg: 12.6, purchasePriceSource: 'PRODUCER_PREMIUM', purchaseQty: 100,
  })
  assert.equal(out.purchasePricePerKg, undefined)
  assert.equal(out.purchasePriceSource, undefined)
  assert.equal(out.purchaseQty, undefined)
  // Sahanın işine yarayan alanlar DOKUNULMADAN kalmalı
  assert.equal(out.weight, 100)
  assert.equal(out.id, 1)
})

test('dizideki her satır temizlenir (GET /markets/:id/entries şekli)', () => {
  const out = through([
    { id: 1, purchasePricePerKg: 10 },
    { id: 2, purchasePricePerKg: 20 },
  ])
  assert.equal(out.length, 2)
  assert.ok(out.every((e) => e.purchasePricePerKg === undefined))
})

test('iç içe yapıda temizlenir (POST /exit yanıtı: exit → items → entry)', () => {
  const out = through({
    id: 5, marketId: 3,
    items: [{ id: 9, pricePerKg: 20, entry: { id: 1, purchasePricePerKg: 12, weight: 50 } }],
  })
  assert.equal(out.items[0].entry.purchasePricePerKg, undefined)
  assert.equal(out.items[0].entry.weight, 50)
  // SATIŞ fiyatı gizlenmemeli — operatör irsaliyeyi görmek zorunda
  assert.equal(out.items[0].pricePerKg, 20)
})

test('sayfalanan yanıt zarfı korunur ({data,total,page,limit,hasMore})', () => {
  const out = through({
    data: [{ id: 1, purchaseQty: 100 }], total: 1, page: 1, limit: 50, hasMore: false,
  })
  assert.equal(out.data[0].purchaseQty, undefined)
  assert.equal(out.total, 1)
  assert.equal(out.hasMore, false)
})

test('Date ve null değerler bozulmaz', () => {
  const d = new Date('2026-08-26T09:00:00Z')
  const out = through({ createdAt: d, producerId: null, purchasePricePerKg: 1 })
  assert.equal(out.createdAt.getTime(), d.getTime())
  assert.equal(out.producerId, null)
  assert.equal(out.purchasePricePerKg, undefined)
})

test('döngüsel referans sonsuz döngüye girmez', () => {
  const a = { id: 1, purchasePricePerKg: 5 }
  a.self = a
  const out = through(a)
  assert.equal(out.purchasePricePerKg, undefined)
})

test('gövdesiz yanıtlar çökertmez', () => {
  assert.equal(through(null), null)
  assert.equal(through(undefined), undefined)
  assert.deepEqual(through({ ok: true }), { ok: true })
})
