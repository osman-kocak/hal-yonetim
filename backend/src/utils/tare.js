import { round2 } from './money.js'

// ————————————————————————————————————————————————————————————————————————
// KASA DARASI — tartıya giren boş kasanın ağırlığı.
//
// Mal kasasıyla birlikte tartılıyor. Operatörün yazdığı kilo BRÜT'tür; malın
// gerçek ağırlığı (NET) bundan kasa ağırlığı düşülerek bulunur. Net yazılmazsa
// hem üreticiye kasa ağırlığı kadar fazla ödenir hem bayiye fazla fatura
// kesilir — aynı hata iki tarafta birden para kaybettirir.
//
// TEK KARAR NOKTASI. Kilo düşen her akış (saha mal kabul, ofis girişi, iade
// kabulü, kilo düzeltmesi) applyTare()'den geçer; oran veya koşul değişecekse
// yalnız bu dosya değişir.
//
// DİKKAT — frontend/src/utils/tare.js ile KİLİT ADIMLI: oradaki kopya yalnız
// ekrandaki canlı önizlemeyi basıyor, hesabın kendisi HER ZAMAN burada yapılır.
// İkisi ayrışırsa ekran bir rakam gösterip kayda başkası yazılır.
// ————————————————————————————————————————————————————————————————————————

// Kasa başına dara. Site geneli SABİT (2026-08-27 kararı): ürün bazlı ayar
// istenmedi. Değişecekse buradan — geçmiş kayıtlar Entry.tareKg snapshot'ını
// taşıdığı için etkilenmez.
export const TARE_PER_CASE_KG = 2

// Bu satırda dara düşülür mü?
//
// (1) YALNIZ KİLOLU ürün. BUNCH/PIECE'te weight kolonu bağ/adet SAYISI tutuyor
//     (bkz. Entry.weight) — oradan kilo düşmek "30 bağ − 4 kg" demek olurdu.
// (2) YALNIZ NORMAL kasa. Siyah/karton kasa (disposableCase) malla birlikte
//     gidiyor ve tartıda kayda değer bir ağırlığı yok; düşülürse üreticiye eksik
//     ödenir. Kullanıcının isteği birebir bu ayrım.
//
// weak / bQuality KARIŞMAZ: ikisi de etiket, kasa ağırlığını değiştirmiyor.
export function tareApplies({ unit, disposableCase }) {
  return unit === 'CASE' && !disposableCase
}

// Bu satırın toplam darası (kg). Uygulanmıyorsa 0.
export function tareFor({ unit, caseCount, disposableCase }) {
  if (!tareApplies({ unit, disposableCase })) return 0
  const kasa = Number(caseCount)
  if (!Number.isFinite(kasa) || kasa <= 0) return 0
  return round2(kasa * TARE_PER_CASE_KG)
}

// Brüt tartımdan net'i çıkarır.
//
// { gross, tare, net, error } döner. error dolu ise ÇAĞIRAN 400 DÖNMELİ:
// dara brütü aşıyorsa ortada tartılmış mal yok, sıfır ya da eksi kiloyu kayda
// geçirmek stoku ve cariyi anlamsız hale getirir. Sessizce 0'a çekmek daha
// kötü: kasası sayılan ama kilosu olmayan bir mal kabul satırı doğar ve
// üreticinin borcu sıfır yazılır.
export function applyTare({ unit, caseCount, disposableCase, weight }) {
  const gross = Number(weight)
  const tare = tareFor({ unit, caseCount, disposableCase })
  if (tare === 0) return { gross, tare: 0, net: gross, error: null }

  const net = round2(gross - tare)
  if (net <= 0) {
    return {
      gross,
      tare,
      net,
      error: `${Number(caseCount)} kasa × ${TARE_PER_CASE_KG} kg = ${tare} kg dara, `
        + `girilen ${gross} kg'a eşit veya ondan fazla. Kasa adedini ya da kiloyu kontrol edin.`,
    }
  }
  return { gross, tare, net, error: null }
}
