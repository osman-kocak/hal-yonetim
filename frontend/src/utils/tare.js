// ————————————————————————————————————————————————————————————————————————
// KASA DARASI — ekrandaki canlı önizleme.
//
// DİKKAT: backend/src/utils/tare.js ile KİLİT ADIMLI. Buradaki kopya YALNIZCA
// operatör kaydetmeden önce net kiloyu görebilsin diye var; hesabın kendisi her
// zaman sunucuda yapılır ve kayda sunucunun bulduğu net yazılır. İkisi
// ayrışırsa ekran bir rakam gösterip kayda başkası yazılır — bu yüzden oran ya
// da koşul değişecekse İKİSİ BİRLİKTE değişmeli.
// ————————————————————————————————————————————————————————————————————————

export const TARE_PER_CASE_KG = 2

// Yalnız kilolu üründe (CASE) ve yalnız normal kasada. Siyah/karton kasa malla
// birlikte gidiyor, tartıda karşılığı yok; bağ/adette weight kolonu sayı tutuyor.
export function tareApplies({ unit, disposableCase }) {
  return unit === 'CASE' && !disposableCase
}

export function tareFor({ unit, caseCount, disposableCase }) {
  if (!tareApplies({ unit, disposableCase })) return 0
  const kasa = Number(caseCount)
  if (!Number.isFinite(kasa) || kasa <= 0) return 0
  return Math.round(kasa * TARE_PER_CASE_KG * 100) / 100
}

// Önizleme için { gross, tare, net, gecersiz } döner.
// gecersiz = dara brütü aşıyor; sunucu bu satırı 400 ile reddedecek, ekran da
// kaydetmeden önce uyarmalı.
export function previewTare({ unit, caseCount, disposableCase, weight }) {
  const gross = Number(weight)
  const tare = tareFor({ unit, caseCount, disposableCase })
  if (!Number.isFinite(gross) || gross <= 0 || tare === 0) {
    return { gross, tare: 0, net: gross, gecersiz: false, uygulandi: false }
  }
  const net = Math.round((gross - tare) * 100) / 100
  return { gross, tare, net, gecersiz: net <= 0, uygulandi: true }
}
