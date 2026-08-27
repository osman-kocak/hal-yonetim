// Alış fiyatı çözümleyicisinin birim testleri.
//
// Bu dosya para yazan tek fonksiyonu koruyor: purchasePriceOf yanlış çalışırsa
// üretici eksik/fazla para alır ve hata sessizdir — kimse fark etmez. Node'un
// yerleşik test runner'ı kullanılıyor (node --test), yeni bağımlılık yok.

import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPurchasePriceMap, purchasePriceOf } from '../src/utils/purchasePrices.js'

const DOMATES = 12
const BIBER = 13

function makeMap() {
  return buildPurchasePriceMap({
    general: [
      { productId: DOMATES, pricePerKg: 12 },
      { productId: BIBER, pricePerKg: 8.5 },
    ],
    special: [
      { producerId: 7, productId: DOMATES, pricePerKg: 14 },
      { producerId: 9, productId: DOMATES, pricePerKg: 20, cancelled: true },
    ],
  })
}

test('genel fiyat: prim yoksa olduğu gibi döner', () => {
  const r = purchasePriceOf(makeMap(), { productId: DOMATES, producerId: 3, premiumPct: 0 })
  assert.equal(r.pricePerKg, 12)
  assert.equal(r.source, 'GENERAL')
  assert.equal(r.premiumPct, null)
})

test('prim +5: genel fiyatın %5 üstü', () => {
  const r = purchasePriceOf(makeMap(), { productId: DOMATES, producerId: 3, premiumPct: 5 })
  assert.equal(r.pricePerKg, 12.6)
  assert.equal(r.source, 'PRODUCER_PREMIUM')
  assert.equal(r.premiumPct, 5)
})

test('iskonto -3: genel fiyatın %3 altı', () => {
  const r = purchasePriceOf(makeMap(), { productId: DOMATES, producerId: 4, premiumPct: -3 })
  assert.equal(r.pricePerKg, 11.64)
  assert.equal(r.source, 'PRODUCER_PREMIUM')
})

test('ÖZEL FİYAT NİHAİDİR: prim üstüne UYGULANMAZ', () => {
  // Bu testin kırılması, özelliğin en kritik davranışının bozulduğu anlamına gelir.
  // 7 numaralı üreticinin primi %5 olsa bile özel fiyat 14,00 aynen kalmalı —
  // 14,70 çıkarsa muhasebeci sisteme güvenmez (bkz. purchasePrices.js başlığı).
  const r = purchasePriceOf(makeMap(), { productId: DOMATES, producerId: 7, premiumPct: 5 })
  assert.equal(r.pricePerKg, 14)
  assert.equal(r.source, 'PRODUCER_SPECIAL')
  assert.equal(r.premiumPct, null, 'özel fiyatta premiumPct null olmalı — prim uygulanmadı')
})

test('fiyat yoksa null döner, 0 DÖNMEZ', () => {
  // 0 "bedava aldık" demek, null "muhasebeci girmedi" demek. Karışırsa üreticinin
  // parası sessizce silinir.
  const r = purchasePriceOf(makeMap(), { productId: 999, producerId: 3, premiumPct: 5 })
  assert.equal(r.pricePerKg, null)
  assert.notEqual(r.pricePerKg, 0)
  assert.equal(r.source, null)
})

test('üreticisiz giriş: prim atlanır, genel fiyat kalır', () => {
  const r = purchasePriceOf(makeMap(), { productId: DOMATES, producerId: null, premiumPct: 5 })
  assert.equal(r.pricePerKg, 12)
  assert.equal(r.source, 'GENERAL')
})

test('iptal edilmiş özel fiyat yok sayılır, prim katmanına düşer', () => {
  // cancelled satırı silinmiyor (carry-forward bir öncekini diriltmesin diye)
  // ama çözümleyici onu görmezden gelmeli.
  const r = purchasePriceOf(makeMap(), { productId: DOMATES, producerId: 9, premiumPct: 5 })
  assert.equal(r.pricePerKg, 12.6)
  assert.equal(r.source, 'PRODUCER_PREMIUM')
})

test('birim fiyat kuruşa yuvarlanır: 8.5 × 1.05 = 8.93', () => {
  // Ham sonuç 8.925. Ekranda 8,93 görünecekse tutar da 8,93 üzerinden
  // hesaplanmalı, yoksa muhasebeci elle çarptığında tutmaz.
  const r = purchasePriceOf(makeMap(), { productId: BIBER, producerId: 3, premiumPct: 5 })
  assert.equal(r.pricePerKg, 8.93)
})

test('özel fiyat başka ürüne sızmaz', () => {
  // 7 numaralı üreticinin yalnız domateste özel fiyatı var; biberde genel kalmalı.
  const r = purchasePriceOf(makeMap(), { productId: BIBER, producerId: 7, premiumPct: 0 })
  assert.equal(r.pricePerKg, 8.5)
  assert.equal(r.source, 'GENERAL')
})

test('map anahtarları çakışmıyor: özel kovası genel kovasını ezmiyor', () => {
  const map = makeMap()
  assert.equal(map.general['12'], 12)
  assert.equal(map.special['7_12'], 14)
  assert.equal(map.general['7_12'], undefined)
})

test('bozuk girdiler çökertmez', () => {
  assert.equal(purchasePriceOf(null, { productId: DOMATES }).pricePerKg, null)
  assert.equal(purchasePriceOf(makeMap(), { productId: null }).pricePerKg, null)
  assert.equal(purchasePriceOf(makeMap(), {}).pricePerKg, null)
  assert.equal(buildPurchasePriceMap().general['1'], undefined)
  assert.equal(buildPurchasePriceMap({}).special['1_1'], undefined)
})

test('geçersiz prim yok sayılır, genel fiyat kalır', () => {
  const r = purchasePriceOf(makeMap(), { productId: DOMATES, producerId: 3, premiumPct: NaN })
  assert.equal(r.pricePerKg, 12)
  assert.equal(r.source, 'GENERAL')
})
