// signFor regresyon kalkanı. Bu fonksiyon bakiyenin YÖNÜNÜ belirliyor; bir
// işaret ters dönerse borç alacak, alacak borç görünür ve kimse fark etmez.
// Üretici ödeme paneli aynı fonksiyonu kullanacağı için buradaki her satır
// hem bayi hem üretici tarafını koruyor.

import test from 'node:test'
import assert from 'node:assert/strict'
import { signFor } from '../src/controllers/ledgerController.js'

test('bayi tarafı: irsaliye ve düzeltme borç artırır, tahsilat azaltır', () => {
  assert.equal(signFor('MARKET_INVOICE'), 1)
  assert.equal(signFor('MARKET_ADJUSTMENT'), 1)
  assert.equal(signFor('MARKET_PAYMENT'), -1)
})

test('üretici tarafı: borç ve düzeltme artırır, ödeme azaltır', () => {
  assert.equal(signFor('PRODUCER_DEBT'), 1)
  assert.equal(signFor('PRODUCER_ADJUSTMENT'), 1)
  assert.equal(signFor('PRODUCER_PAYMENT'), -1)
})

test('bilinmeyen tip bakiyeyi etkilemez', () => {
  assert.equal(signFor('WHATEVER'), 0)
  assert.equal(signFor(undefined), 0)
})
