import { prisma } from '../utils/prismaClient.js'
import { auditUpdate, auditDelete } from '../utils/audit.js'
import { parsePagination, paginated } from '../utils/pagination.js'
import { sumTrackedCases } from '../utils/cases.js'
import { sumQty } from '../utils/units.js'

// ————————————————————————————————————————————————————————————————————————
// LEGAL FATURA EŞLEŞTİRMESİ
//
// Kesilen irsaliyenin resmi fatura karşılığı burada tutuluyor. Panel iki
// sekmeli ve sekmeler tam olarak Exit.invoiceNo'nun boş/dolu olmasıdır —
// ayrı bir "durum" kolonu YOK: iki kaynaklı gerçek, er ya da geç ayrışır
// (fatura no silinip durum "onaylı" kalır gibi).
// ————————————————————————————————————————————————————————————————————————

// Fatura numarasını normalize et. Baştaki/sondaki boşluk ve içerideki çoklu
// boşluk temizleniyor: "  MSK 2026 " ile "MSK 2026" aynı numaradır ve ikisini
// ayrı kayıt saymak benzersizlik kontrolünü işe yaramaz hale getirir.
function normalizeInvoiceNo(raw) {
  if (raw == null) return null
  const s = String(raw).replace(/\s+/g, ' ').trim()
  return s === '' ? null : s
}

const MAX_INVOICE_LEN = 64

// Panelin ihtiyacı olan hafif alanlar. items DAHİL DEĞİL: widget'ta kalem
// listesi gösterilmiyor ve her satır için 10-20 ExitItem çekmek sayfayı
// gereksiz büyütür. Tutar için items gerekiyor — yalnız fiyat/miktar alanları
// seçiliyor, ürün/üretici ilişkileri açılmıyor.
const QUEUE_SELECT = {
  id: true,
  createdAt: true,
  createdBy: true,
  editedAt: true,
  invoiceNo: true,
  invoiceAt: true,
  invoiceBy: true,
  printedAt: true,
  printedBy: true,
  printCount: true,
  market: { select: { id: true, no: true, name: true } },
  items: {
    select: {
      pricePerKg: true,
      entry: { select: { weight: true, caseCount: true, unit: true, disposableCase: true } },
    },
  },
}

function ozetle(exit) {
  const qty = sumQty(exit.items, (i) => i.entry)
  return {
    id: exit.id,
    createdAt: exit.createdAt,
    createdBy: exit.createdBy,
    edited: !!exit.editedAt,
    market: exit.market,
    invoiceNo: exit.invoiceNo,
    invoiceAt: exit.invoiceAt,
    invoiceBy: exit.invoiceBy,
    printedAt: exit.printedAt,
    printedBy: exit.printedBy,
    printCount: exit.printCount,
    itemCount: exit.items.length,
    // Kasa: bayi bakiyesine giren sayı (siyah kasa hariç) — irsaliye başlığıyla
    // aynı rakam olmalı, yoksa "40 kasa aldım, borcum 32 arttı" çelişkisi çıkar.
    trackedCases: sumTrackedCases(exit.items, (i) => i.entry),
    totalWeight: qty.weight,
    totalBunches: qty.bunches,
    totalPieces: qty.pieces,
    // Fiyatı girilmemiş kalem tutara girmez; onay ekranı bunu göstermeli, yoksa
    // muhasebeci eksik tutarı gerçek sanır.
    amount: exit.items.reduce(
      (s, i) => s + (i.pricePerKg != null ? i.pricePerKg * (i.entry?.weight ?? 0) : 0),
      0,
    ),
    missingPrices: exit.items.filter((i) => i.pricePerKg == null).length,
  }
}

// GET /api/admin/exits/invoice-queue?status=pending|approved&q=&page=&limit=
//
// SAYFALI: irsaliye sayısı gün geçtikçe artıyor, kuyruk tamamı çekilirse widget
// zamanla açılmaz olur.
export async function invoiceQueue(req, res, next) {
  try {
    const { status = 'pending', q } = req.query
    if (!['pending', 'approved'].includes(status)) {
      return res.status(400).json({ error: 'Geçersiz durum' })
    }
    const { page, limit, skip } = parsePagination(req, { defaultLimit: 10 })

    const where = { invoiceNo: status === 'pending' ? null : { not: null } }

    const arama = normalizeInvoiceNo(q)
    if (arama) {
      const asId = Number(arama)
      where.OR = [
        { market: { name: { contains: arama, mode: 'insensitive' } } },
        // Fiş no ile arama: muhasebeci elindeki kâğıttan "150" yazıyor.
        ...(Number.isInteger(asId) ? [{ id: asId }] : []),
        // Onaylılar sekmesinde fatura no ile de aranabilmeli.
        ...(status === 'approved' ? [{ invoiceNo: { contains: arama, mode: 'insensitive' } }] : []),
        ...(Number.isInteger(asId) ? [{ market: { no: asId } }] : []),
      ]
    }

    const [rows, total, bekleyenSayisi] = await Promise.all([
      prisma.exit.findMany({
        where,
        // Bekleyenler ESKİDEN YENİYE: en uzun bekleyen fatura en tepede olmalı,
        // yoksa kuyruğun dibi hiç görülmez. Onaylılar yeniden eskiye — orada
        // ilgi çeken en son yapılan iştir.
        orderBy: { createdAt: status === 'pending' ? 'asc' : 'desc' },
        skip,
        take: limit,
        select: QUEUE_SELECT,
      }),
      prisma.exit.count({ where }),
      prisma.exit.count({ where: { invoiceNo: null } }),
    ])

    res.json({
      ...paginated(rows.map(ozetle), total, { page, limit, skip }),
      // Sekme rozeti — hangi sekmede olursak olalım bekleyen sayısı görünmeli.
      pendingCount: bekleyenSayisi,
    })
  } catch (err) { next(err) }
}

// POST /api/admin/exits/:id/invoice   { invoiceNo }
//
// Hem ONAY hem DÜZELTME. Ayrı uç açılmadı: ikisi de "bu irsaliyenin fatura
// numarası şudur" demek ve tek yol olması çakışma kontrolünün tek yerde
// kalmasını sağlıyor.
export async function setInvoiceNo(req, res, next) {
  try {
    const id = Number(req.params.id)
    const invoiceNo = normalizeInvoiceNo(req.body?.invoiceNo)

    if (!invoiceNo) {
      return res.status(400).json({ error: 'Fatura numarası boş olamaz' })
    }
    if (invoiceNo.length > MAX_INVOICE_LEN) {
      return res.status(400).json({ error: `Fatura numarası en fazla ${MAX_INVOICE_LEN} karakter olabilir` })
    }

    const exit = await prisma.exit.findUnique({
      where: { id },
      select: { id: true, invoiceNo: true, market: { select: { no: true, name: true } } },
    })
    if (!exit) return res.status(404).json({ error: 'İrsaliye bulunamadı' })

    // ÇAKIŞMA KONTROLÜ BÜYÜK/KÜÇÜK HARF DUYARSIZ.
    // DB'deki unique index harfe duyarlı: "msk-1" ile "MSK-1" ayrı satır olarak
    // geçer. Muhasebe açısından ikisi aynı faturadır; burada yakalanmazsa iki
    // irsaliye aynı faturaya bağlanmış olur ve mutabakat sessizce bozulur.
    const cakisan = await prisma.exit.findFirst({
      where: {
        invoiceNo: { equals: invoiceNo, mode: 'insensitive' },
        id: { not: id },
      },
      select: { id: true, market: { select: { no: true, name: true } } },
    })
    if (cakisan) {
      return res.status(409).json({
        error: `Bu fatura numarası #${cakisan.id} nolu irsaliyede kullanılıyor `
          + `(${cakisan.market?.no} ${cakisan.market?.name})`,
      })
    }

    const by = req.user?.name || req.user?.username || 'Admin'
    const updated = await prisma.exit.update({
      where: { id },
      data: { invoiceNo, invoiceAt: new Date(), invoiceBy: by },
      select: QUEUE_SELECT,
    })

    // Denetim kaydı ŞART: fatura eşleştirmesi resmi evrakla ilgili ve sonradan
    // "kim ne zaman hangi numarayı yazdı" sorulur. Düzeltmede eski değer de
    // yazılıyor — yalnız yenisini yazmak düzeltmeyi görünmez kılardı.
    auditUpdate(
      req, 'exit', id,
      exit.invoiceNo
        ? `#${id} fatura no düzeltildi: ${exit.invoiceNo} → ${invoiceNo}`
        : `#${id} faturalandı: ${invoiceNo} · ${exit.market?.no} ${exit.market?.name}`,
    )

    res.json(ozetle(updated))
  } catch (err) {
    // Unique index'e yarış durumunda çarpılabilir (iki muhasebeci aynı anda).
    // Genel 500 yerine anlamlı mesaj: kullanıcı numarayı kontrol etsin.
    if (err?.code === 'P2002') {
      return res.status(409).json({ error: 'Bu fatura numarası başka bir irsaliyede kullanılıyor' })
    }
    next(err)
  }
}

// DELETE /api/admin/exits/:id/invoice — onayı geri al. YALNIZ ADMIN.
//
// Muhasebeciye açılmadı: numarayı DÜZELTMEK onun işi (setInvoiceNo), ama
// eşleştirmeyi tamamen kaldırmak resmi evrakla irsaliye arasındaki bağı koparır.
export async function clearInvoiceNo(req, res, next) {
  try {
    const id = Number(req.params.id)
    const exit = await prisma.exit.findUnique({
      where: { id },
      select: { id: true, invoiceNo: true },
    })
    if (!exit) return res.status(404).json({ error: 'İrsaliye bulunamadı' })
    if (!exit.invoiceNo) {
      return res.status(400).json({ error: 'Bu irsaliye zaten onaylanmamış' })
    }

    const updated = await prisma.exit.update({
      where: { id },
      data: { invoiceNo: null, invoiceAt: null, invoiceBy: null },
      select: QUEUE_SELECT,
    })
    auditDelete(req, 'exit', id, `#${id} fatura eşleştirmesi kaldırıldı (${exit.invoiceNo})`)
    res.json(ozetle(updated))
  } catch (err) { next(err) }
}

// POST /api/exit/:id/printed · POST /api/admin/exits/:id/printed
//
// "İrsaliye basıldı" rozeti. İstemci yazdırmayı TETİKLEDİKTEN SONRA çağırır.
//
// GÜVENİLİRLİK SINIRI: tarayıcı yazdırmanın gerçekten olduğunu söylemiyor —
// AirPrint paneli açılıp iptal edilse de buraya "basıldı" gelir. Bu yüzden onay
// kuyruğu bu alana BAĞLANMADI; rozet bilgi amaçlıdır.
//
// AUDIT YOK: baskı günde onlarca kez olur ve denetim kaydını şişirip asıl
// aranan olayları (silme, fiyat değişikliği) gömerdi.
export async function markPrinted(req, res, next) {
  try {
    const id = Number(req.params.id)
    const exit = await prisma.exit.findUnique({ where: { id }, select: { id: true, printedAt: true } })
    if (!exit) return res.status(404).json({ error: 'İrsaliye bulunamadı' })

    const by = req.user?.name || req.user?.username || 'Sistem'
    const updated = await prisma.exit.update({
      where: { id },
      data: {
        // İlk baskı anı SABİT: rozet "ne zaman basıldı" diye soruyor, yeniden
        // baskılar onu ötelememeli. Kaçıncı baskı olduğu printCount'ta.
        ...(exit.printedAt ? {} : { printedAt: new Date(), printedBy: by }),
        printCount: { increment: 1 },
      },
      select: { id: true, printedAt: true, printedBy: true, printCount: true },
    })
    res.json(updated)
  } catch (err) { next(err) }
}
