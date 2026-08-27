import test from 'node:test'
import assert from 'node:assert/strict'
import { round2, sumMoney } from '../src/utils/money.js'

test('round2 kuruşa yuvarlar', () => {
  assert.equal(round2(0.1 + 0.2), 0.3)
  assert.equal(round2(8.925), 8.93)
  assert.equal(round2(18499.999999), 18500)
  assert.equal(round2(-4.567), -4.57)
})

test('round2 sayı olmayanı 0 yapar', () => {
  // Tutar alanına null/undefined düşerse NaN yayılmasın: NaN bir kez toplama
  // girerse tüm bakiye NaN olur ve ekran boş kalır.
  assert.equal(round2(null), 0)
  assert.equal(round2(undefined), 0)
  assert.equal(round2('abc'), 0)
  assert.equal(round2(Infinity), 0)
})

test('round2 sayısal string kabul eder', () => {
  assert.equal(round2('12.345'), 12.35)
})

test('sumMoney ara toplamları yuvarlamadan toplar', () => {
  assert.equal(sumMoney([0.1, 0.2, 0.3]), 0.6)
  assert.equal(sumMoney([{ a: 1.005 }, { a: 2.005 }], (r) => r.a), 3.01)
  assert.equal(sumMoney([]), 0)
  assert.equal(sumMoney(null), 0)
})
