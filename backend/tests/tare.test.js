import test from 'node:test'
import assert from 'node:assert/strict'
import { TARE_PER_CASE_KG, applyTare, tareApplies, tareFor } from '../src/utils/tare.js'

test('dara yalnız NORMAL kasada düşülür', () => {
  // Kullanıcının kuralı birebir bu: siyah kasa tikliyken dara YOK.
  assert.equal(tareApplies({ unit: 'CASE', disposableCase: false }), true)
  assert.equal(tareApplies({ unit: 'CASE', disposableCase: true }), false)
})

test('dara yalnız kilolu üründe düşülür', () => {
  // BUNCH/PIECE'te weight kolonu SAYI tutuyor — "30 bağ − 4 kg" anlamsız.
  assert.equal(tareApplies({ unit: 'BUNCH', disposableCase: false }), false)
  assert.equal(tareApplies({ unit: 'PIECE', disposableCase: false }), false)
})

test('dara = kasa adedi × 2 kg', () => {
  assert.equal(TARE_PER_CASE_KG, 2)
  assert.equal(tareFor({ unit: 'CASE', caseCount: 10, disposableCase: false }), 20)
  assert.equal(tareFor({ unit: 'CASE', caseCount: 1, disposableCase: false }), 2)
  assert.equal(tareFor({ unit: 'CASE', caseCount: 10, disposableCase: true }), 0)
  assert.equal(tareFor({ unit: 'BUNCH', caseCount: 10, disposableCase: false }), 0)
})

test('kasasız kilolu giriş darasız kalır', () => {
  // Çuvalla/dökme gelen mal: kasa 0 → düşülecek bir şey yok.
  assert.equal(tareFor({ unit: 'CASE', caseCount: 0, disposableCase: false }), 0)
  const r = applyTare({ unit: 'CASE', caseCount: 0, disposableCase: false, weight: 100 })
  assert.deepEqual(r, { gross: 100, tare: 0, net: 100, error: null })
})

test('applyTare brütten neti çıkarır', () => {
  const r = applyTare({ unit: 'CASE', caseCount: 10, disposableCase: false, weight: 100 })
  assert.equal(r.gross, 100)
  assert.equal(r.tare, 20)
  assert.equal(r.net, 80)
  assert.equal(r.error, null)
})

test('siyah kasada net brüte eşit kalır', () => {
  const r = applyTare({ unit: 'CASE', caseCount: 10, disposableCase: true, weight: 100 })
  assert.deepEqual(r, { gross: 100, tare: 0, net: 100, error: null })
})

test('bağ/adet miktarına dokunulmaz', () => {
  const r = applyTare({ unit: 'BUNCH', caseCount: 5, disposableCase: false, weight: 30 })
  assert.deepEqual(r, { gross: 30, tare: 0, net: 30, error: null })
})

test('dara brütü aşarsa HATA döner, sessizce 0 yazılmaz', () => {
  // 10 kasa × 2 = 20 kg dara, girilen 15 kg. Sıfır/eksi kiloyu kayda geçirmek
  // stoku ve cariyi anlamsız hale getirir; çağıran 400 dönmeli.
  const r = applyTare({ unit: 'CASE', caseCount: 10, disposableCase: false, weight: 15 })
  assert.ok(r.error, 'hata bekleniyordu')
  assert.match(r.error, /20 kg dara/)
  assert.match(r.error, /15 kg/)
})

test('dara brüte EŞİTSE de hata döner', () => {
  // Net 0 = kasası olan ama malı olmayan bir mal kabul satırı.
  const r = applyTare({ unit: 'CASE', caseCount: 10, disposableCase: false, weight: 20 })
  assert.ok(r.error, 'net 0 kabul edilmemeli')
})

test('ondalık brütte kuruş artığı bırakmaz', () => {
  // 229.98 − 20 float'ta 209.97999999999996 verir; kayda öyle yazılırsa
  // dökümde "209,98" görünüp toplamlar tutmaz.
  const r = applyTare({ unit: 'CASE', caseCount: 10, disposableCase: false, weight: 229.98 })
  assert.equal(r.net, 209.98)
})

test('geçersiz kasa adedi darayı 0 yapar, NaN yaymaz', () => {
  // NaN bir kez weight'e girerse stok ve cari NaN'a düşer, ekran boş kalır.
  assert.equal(tareFor({ unit: 'CASE', caseCount: null, disposableCase: false }), 0)
  assert.equal(tareFor({ unit: 'CASE', caseCount: 'abc', disposableCase: false }), 0)
  assert.equal(tareFor({ unit: 'CASE', caseCount: -3, disposableCase: false }), 0)
})
