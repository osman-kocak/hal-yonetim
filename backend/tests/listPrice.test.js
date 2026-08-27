// İndirimli satış fiyatı — normal (liste) fiyat çözümlemesi.
//
// Kural: pricePerKg her zaman UYGULANACAK tutar, listPricePerKg yalnız gösterim.
// İkisinin arama sırası BİREBİR aynı olmalı, yoksa fişte bir kalemin indirimi
// başka bir kalemin fiyatıyla eşleşir.
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPriceMap, buildListPriceMap, priceOf, listPriceOf } from '../src/utils/prices.js'

const satirlar = [
  // indirimli: normal 70, uygulanan 50
  { productId: 1, qualityId: null, pricePerKg: 50, listPricePerKg: 70 },
  // indirimsiz
  { productId: 2, qualityId: null, pricePerKg: 40, listPricePerKg: null },
  // eski kaliteli satır (geriye dönük)
  { productId: 3, qualityId: 9, pricePerKg: 30, listPricePerKg: 35 },
]

test('indirimli üründe uygulanan fiyat NET tutardır', () => {
  const m = buildPriceMap(satirlar)
  assert.equal(priceOf(m, 1, null), 50, 'fatura net fiyattan kesilmeli')
})

test('normal fiyat ayrı map ten okunur', () => {
  const l = buildListPriceMap(satirlar)
  assert.equal(listPriceOf(l, 1, null), 70)
})

test('indirim yoksa normal fiyat null döner', () => {
  const l = buildListPriceMap(satirlar)
  assert.equal(listPriceOf(l, 2, null), null, 'null = indirim yok, fişte tek fiyat basılır')
})

test('listPricePerKg null olan satır liste mapine hiç girmez', () => {
  const l = buildListPriceMap(satirlar)
  assert.equal('2' in l, false)
})

test('kaliteli satırda arama sırası priceOf ile aynı', () => {
  const m = buildPriceMap(satirlar)
  const l = buildListPriceMap(satirlar)
  assert.equal(priceOf(m, 3, 9), 30)
  assert.equal(listPriceOf(l, 3, 9), 35)
})

test('bilinmeyen ürün null döner, çökmez', () => {
  const l = buildListPriceMap(satirlar)
  assert.equal(listPriceOf(l, 999, null), null)
  assert.equal(listPriceOf(null, 1, null), null)
  assert.equal(listPriceOf(l, null, null), null)
})

test('indirim oranı normal ve net ten hesaplanabilir', () => {
  const m = buildPriceMap(satirlar), l = buildListPriceMap(satirlar)
  const net = priceOf(m, 1, null), normal = listPriceOf(l, 1, null)
  assert.equal(normal - net, 20)
  assert.equal(Math.round(((normal - net) / normal) * 100), 29)
})
