import { prisma } from '../utils/prismaClient.js'
import { getPriceMaps } from './priceController.js'
import { isSpecialMarket, findDepoMarket, DEPO_NO } from '../utils/markets.js'
import { sumTrackedCases } from '../utils/cases.js'
import { priceOf, listPriceOf } from '../utils/prices.js'
import { toPriceDate } from '../utils/date.js'
import { marketSummary } from '../utils/marketSummary.js'
import { assertExitLock } from '../utils/exitLock.js'
import { auditCreate, auditUpdate, auditDelete } from '../utils/audit.js'

export async function createExit(req, res, next) {
  try {
    const { marketId, entryIds } = req.body

    if (!marketId || !entryIds?.length) {
      return res.status(400).json({ error: 'Market ve en az bir ürün seçimi zorunludur' })
    }

    // Özel pazarlara (DEPO=0, ATILAN=99) irsaliye kesilemez — bunlar bayi değil.
    // Eskiden sadece DEPO engelliydi; 99'a entry yazılmaya başlayınca imha
    // edilen mala irsaliye kesilip bayiye borç yazılabilirdi.
    const targetMarket = await prisma.market.findUnique({ where: { id: Number(marketId) } })
    if (!targetMarket) return res.status(404).json({ error: 'Pazar bulunamadı' })
    if (isSpecialMarket(targetMarket)) {
      const hint = targetMarket.no === DEPO_NO
        ? 'Depoya irsaliye kesilemez — Depo Transfer kullanın'
        : 'İmha pazarına irsaliye kesilemez'
      return res.status(400).json({ error: hint })
    }

    // Ekran kilidi burada da doğrulanıyor: yalnızca ekranda kontrol edilseydi
    // kilidi olmayan bir istemci doğrudan POST atıp aynı çakışmayı üretirdi.
    // ADMIN muaf, kilit yoksa/bayatsa geçer (bkz. utils/exitLock.js).
    const lockError = await assertExitLock(Number(marketId), req.user)
    if (lockError) return res.status(409).json({ error: lockError })

    // Kesen kişi OTURUMDAN — istemciden değil. Eskiden istemci bu alanı hiç
    // göndermiyordu ve HER fişe düz "Operatör" yazılıyordu: 252 irsaliyenin
    // tamamı aynı isimdeydi, "bu fişi kim kesti" sorusu ancak AuditLog'a JOIN
    // atarak cevaplanabiliyordu. printedBy ve editedBy zaten oturumdan okuyor;
    // üçü aynı fişte farklı kaynaktan gelirse ekranda "yılmaz bastı ama Operatör
    // kesti" gibi anlamsız satırlar çıkıyor.
    const createdBy = req.user?.name || req.user?.username || req.body.createdBy || 'Operatör'

    // Aynı entry başka irsaliyede var mı?
    const alreadyExited = await prisma.exitItem.findMany({
      where: { entryId: { in: entryIds.map(Number) } },
      select: { entryId: true },
    })
    if (alreadyExited.length) {
      const ids = alreadyExited.map((i) => i.entryId).join(', ')
      return res.status(409).json({ error: `Bazı ürünler zaten irsaliye edilmiş (giriş ID: ${ids})` })
    }

    // İki map: tutar net fiyattan hesaplanır, fişteki indirim satırı normal
    // fiyattan basılır (bkz. utils/prices.js → listPriceOf).
    const { price: priceMap, list: listMap } = await getPriceMaps(toPriceDate())

    // Önce entry'leri çek ki fiyat snapshot'ı items yazılırken hazır olsun
    const targetEntries = await prisma.entry.findMany({
      where: { id: { in: entryIds.map(Number) } },
      select: { id: true, productId: true, qualityId: true, marketId: true },
    })

    // Entry'ler gerçekten bu pazara ait mi? updateExit bunu kontrol ediyordu,
    // createExit etmiyordu: API'den başka pazarın malı bu irsaliyeye yazılıp
    // borç ve kasa hareketi yanlış bayiye gidebiliyordu.
    if (targetEntries.length !== entryIds.length) {
      return res.status(404).json({ error: 'Bazı girişler bulunamadı' })
    }
    const foreign = targetEntries.filter((e) => e.marketId !== Number(marketId))
    if (foreign.length) {
      return res.status(400).json({
        error: `Bazı girişler bu pazara ait değil (giriş ID: ${foreign.map((e) => e.id).join(', ')})`,
      })
    }
    const entryPriceMap = new Map(targetEntries.map((e) => {
      return [e.id, priceOf(priceMap, e.productId, e.qualityId)]
    }))
    // Normal fiyat SNAPSHOT'ı — pricePerKg ile aynı gerekçe: fiyat sonradan
    // değişse de basılmış fiş aynı indirimi göstermeli. null = indirim yoktu.
    const entryListMap = new Map(targetEntries.map((e) => {
      return [e.id, listPriceOf(listMap, e.productId, e.qualityId)]
    }))

    const exit = await prisma.$transaction(async (tx) => {
      const created = await tx.exit.create({
        data: {
          marketId: Number(marketId),
          createdBy,
          items: {
            create: entryIds.map((entryId) => ({
              entryId: Number(entryId),
              loaded: true,
              pricePerKg: entryPriceMap.get(Number(entryId)),
              listPricePerKg: entryListMap.get(Number(entryId)) ?? null,
            })),
          },
        },
        include: {
          market: true,
          items: {
            include: {
              entry: {
                include: {
                  product: true,
                  quality: true,
                },
              },
            },
          },
        },
      })

      // Siyah/karton kasadaki ve bağ/adetli kalemler kasa borcu doğurmaz —
      // bkz. utils/cases.js. Toplam 0 çıkarsa hiç hareket yazılmaz.
      const totalCases = sumTrackedCases(created.items, (i) => i.entry)
      if (totalCases > 0) {
        await tx.caseMovement.create({
          data: {
            type: 'MARKET_OUT',
            qty: totalCases,
            marketId: created.marketId,
            exitId: created.id,
            occurredAt: created.createdAt,
            createdBy,
            note: `İrsaliye #${created.id}`,
          },
        })
      }

      // Finansal cari hesap: irsaliye → bayi borcu (sadece fiyat varsa)
      const invoiceTotal = created.items.reduce((sum, item) => {
        const price = priceOf(priceMap, item.entry.productId, item.entry.qualityId)
        return price != null ? sum + price * item.entry.weight : sum
      }, 0)
      if (invoiceTotal > 0) {
        await tx.ledgerEntry.create({
          data: {
            type: 'MARKET_INVOICE',
            amount: Math.round(invoiceTotal * 100) / 100,
            marketId: created.marketId,
            exitId: created.id,
            occurredAt: created.createdAt,
            createdBy,
            note: `İrsaliye #${created.id}`,
          },
        })
      }
      return created
    })

    const itemsWithPrice = exit.items.map((item) => {
      const pricePerKg = item.pricePerKg != null ? item.pricePerKg : priceOf(priceMap, item.entry.productId, item.entry.qualityId)
      const totalPrice = pricePerKg !== null ? pricePerKg * item.entry.weight : null
      return { ...item, pricePerKg, totalPrice }
    })

    const missingPrices = itemsWithPrice.filter((i) => i.pricePerKg === null).length

    // İrsaliye başlığı için bayi özeti. Transaction'dan SONRA okunuyor: bu
    // çıkışın kasa hareketi ve borcu bakiyeye zaten işlendi, yani fişte görünen
    // rakam "bu teslimat dahil" güncel durumdur.
    //
    // Yazdırma anında çekilemez — printIrsaliye() senkron olmak zorunda (iOS
    // yazdırma izni await'ten sonra düşüyor, bkz. store/printStore.js), o yüzden
    // veri fişin kendi payload'ında gitmeli.
    const summary = await marketSummary(exit.marketId)

    auditCreate(
      req, 'exit', exit.id,
      `İrsaliye #${exit.id} · Pazar #${targetMarket.no} ${targetMarket.name} · ${exit.items.length} kalem`,
      exit.items.length,
    )

    res.status(201).json({
      ...exit,
      items: itemsWithPrice,
      missingPrices,
      trackedCases: sumTrackedCases(exit.items, (i) => i.entry),
      marketCaseBalance: summary.caseBalance,
      marketDebt: summary.debt,
    })
  } catch (err) {
    next(err)
  }
}

export async function updateExit(req, res, next) {
  try {
    const { id } = req.params
    const { entryIds } = req.body

    if (!entryIds?.length) {
      return res.status(400).json({ error: 'En az bir ürün seçilmeli' })
    }

    // Exit'in marketId'sini al
    const existingExit = await prisma.exit.findUnique({ where: { id: Number(id) } })
    if (!existingExit) {
      return res.status(404).json({ error: 'İrsaliye bulunamadı' })
    }

    // Seçilen tüm entry'ler bu pazara ait mi?
    const entries = await prisma.entry.findMany({
      where: { id: { in: entryIds.map(Number) } },
      select: { id: true, marketId: true },
    })
    const wrongMarket = entries.filter((e) => e.marketId !== existingExit.marketId)
    if (wrongMarket.length) {
      return res.status(400).json({ error: 'Seçilen girişlerin bir kısmı bu pazara ait değil' })
    }

    const { price: priceMap, list: listMap } = await getPriceMaps(toPriceDate(existingExit.createdAt))
    // Düzenleyen OTURUMDAN okunuyor, istemciden değil (2026-08-27): ekranda
    // "kim düzenliyor" diye sormak hem fazladan adım hem de yanlış isim
    // seçilebilen bir alandı. İstemcinin gönderdiği değer artık yalnızca
    // oturumda isim yoksa devreye giriyor.
    const editedBy = req.user?.name || req.user?.username || req.body.editedBy || 'Admin'

    // Zaten irsaliyede olan kalemlerin fiyat snapshot'ı KORUNMALI.
    // Eskiden tüm ExitItem'lar silinip hepsi güncel fiyatla yeniden yazılıyordu:
    // irsaliyeye tek kalem eklemek, değişmemiş kalemlerin fiyatını da
    // güncelliyor ve bayinin faturası kendiliğinden değişiyordu.
    // (schema.prisma: "sonradan fiyat değişse de irsaliye tutarı sabit kalır")
    const existingItems = await prisma.exitItem.findMany({
      where: { exitId: Number(id) },
      select: { entryId: true, pricePerKg: true, listPricePerKg: true },
    })
    const lockedPrices = new Map(existingItems.map((i) => [i.entryId, i.pricePerKg]))
    // İndirim snapshot'ı da kilitli: düzenleme sırasında değişmemiş kalemlerin
    // fişteki indirimi de aynı kalmalı.
    const lockedListPrices = new Map(existingItems.map((i) => [i.entryId, i.listPricePerKg]))

    // İrsaliyeden çıkarılan kalemlerin malı depoya döner — pazarda bırakılırsa
    // çıkış ekranında sebebi belirsiz bekleyen kalem olarak yeniden belirir
    const keptIds = new Set(entryIds.map(Number))
    const removedEntryIds = existingItems.map((i) => i.entryId).filter((eid) => !keptIds.has(eid))
    const depo = removedEntryIds.length ? await findDepoMarket() : null
    if (removedEntryIds.length && !depo) {
      return res.status(404).json({ error: 'DEPO market kaydı bulunamadı' })
    }

    // entry'lerin product/quality bilgisini al ki YENİ kalemlere fiyat atanabilsin
    const targetEntries = await prisma.entry.findMany({
      where: { id: { in: entryIds.map(Number) } },
      select: { id: true, productId: true, qualityId: true },
    })
    const entryPriceMap = new Map(targetEntries.map((e) => {
      if (lockedPrices.has(e.id)) return [e.id, lockedPrices.get(e.id)]
      return [e.id, priceOf(priceMap, e.productId, e.qualityId)]
    }))
    const entryListMap = new Map(targetEntries.map((e) => {
      if (lockedListPrices.has(e.id)) return [e.id, lockedListPrices.get(e.id)]
      return [e.id, listPriceOf(listMap, e.productId, e.qualityId)]
    }))

    let returnedToDepo = 0
    const exit = await prisma.$transaction(async (tx) => {
      await tx.exitItem.deleteMany({ where: { exitId: Number(id) } })
      const updated = await tx.exit.update({
        where: { id: Number(id) },
        data: {
          editedAt: new Date(),
          editedBy,
          items: {
            create: entryIds.map((entryId) => ({
              entryId: Number(entryId),
              loaded: true,
              pricePerKg: entryPriceMap.get(Number(entryId)),
              listPricePerKg: entryListMap.get(Number(entryId)) ?? null,
            })),
          },
        },
        include: {
          market: true,
          items: {
            include: {
              entry: {
                include: {
                  product: true,
                  quality: true,
                  regionSession: { include: { region: true } },
                },
              },
            },
          },
        },
      })

      // Kasa hareketi senkronize et — yalnızca siyah/karton kasa kalemleri
      // sayılmaz (birim artık belirleyici değil, bkz. utils/cases.js).
      // DİKKAT: eski bir irsaliye düzenlenirse toplam BURADA yeniden hesaplanır.
      // 2026-08-13 öncesi kesilmiş, bağ kalemi içeren irsaliyelerde o kalemlerin
      // kasası eskiden sayılmıyordu; düzenleme sırasında bayi kasa borcu bu
      // yüzden artabilir. Beklenen davranış — kural değişti, sayı düzeliyor.
      const totalCases = sumTrackedCases(updated.items, (i) => i.entry)
      const existingCase = await tx.caseMovement.findUnique({ where: { exitId: updated.id } })
      if (totalCases > 0) {
        if (existingCase) {
          await tx.caseMovement.update({
            where: { exitId: updated.id },
            data: { qty: totalCases, marketId: updated.marketId },
          })
        } else {
          await tx.caseMovement.create({
            data: {
              type: 'MARKET_OUT',
              qty: totalCases,
              marketId: updated.marketId,
              exitId: updated.id,
              occurredAt: updated.createdAt,
              createdBy: editedBy,
              note: `İrsaliye #${updated.id}`,
            },
          })
        }
      } else if (existingCase) {
        await tx.caseMovement.delete({ where: { exitId: updated.id } })
      }

      // Finansal cari hesap senkronize
      const invoiceTotal = updated.items.reduce((sum, item) => {
        const price = priceOf(priceMap, item.entry.productId, item.entry.qualityId)
        return price != null ? sum + price * item.entry.weight : sum
      }, 0)
      const roundedInvoice = Math.round(invoiceTotal * 100) / 100
      const existingLedger = await tx.ledgerEntry.findUnique({ where: { exitId: updated.id } })
      if (roundedInvoice > 0) {
        if (existingLedger) {
          await tx.ledgerEntry.update({
            where: { exitId: updated.id },
            data: { amount: roundedInvoice, marketId: updated.marketId },
          })
        } else {
          await tx.ledgerEntry.create({
            data: {
              type: 'MARKET_INVOICE',
              amount: roundedInvoice,
              marketId: updated.marketId,
              exitId: updated.id,
              occurredAt: updated.createdAt,
              createdBy: editedBy,
              note: `İrsaliye #${updated.id}`,
            },
          })
        }
      } else if (existingLedger) {
        await tx.ledgerEntry.delete({ where: { exitId: updated.id } })
      }

      returnedToDepo = await returnEntriesToDepo(tx, {
        entryIds: removedEntryIds,
        fromMarketId: updated.marketId,
        depoId: depo?.id,
        note: `İrsaliye #${updated.id} düzenlendi — kalem çıkarıldı, mal depoya döndü`,
        createdBy: editedBy,
      })
      return updated
    })

    const itemsWithPrice = exit.items.map((item) => {
      const pricePerKg = item.pricePerKg != null ? item.pricePerKg : priceOf(priceMap, item.entry.productId, item.entry.qualityId)
      const totalPrice = pricePerKg !== null ? pricePerKg * item.entry.weight : null
      return { ...item, pricePerKg, totalPrice }
    })

    // Düzenlenen fiş de yeniden basılıyor — başlık aynı özeti taşımalı.
    // Kasa/borç hareketleri transaction içinde senkronlandı, bu okuma güncel.
    const summary = await marketSummary(exit.marketId)

    auditUpdate(
      req, 'exit', exit.id,
      `İrsaliye #${exit.id} düzenlendi · ${exit.items.length} kalem` +
      (returnedToDepo?.length ? ` · ${returnedToDepo.length} kalem depoya döndü` : ''),
    )

    res.json({
      ...exit,
      items: itemsWithPrice,
      returnedToDepo,
      trackedCases: sumTrackedCases(exit.items, (i) => i.entry),
      marketCaseBalance: summary.caseBalance,
      marketDebt: summary.debt,
    })
  } catch (err) {
    next(err)
  }
}

// Silinen/çıkarılan kalemlerin malını depoya döndürür ve iz olarak Transfer yazar.
// Sadece Exit'i silmek yetmiyordu: Entry pazarda kalıyor, çıkış ekranında sebebi
// belirsiz bir "bekleyen kalem" olarak yeniden beliriyor ve depoya dönmesi için
// operatörün elle "depoya al" demesi gerekiyordu.
async function returnEntriesToDepo(tx, { entryIds, fromMarketId, depoId, note, createdBy }) {
  if (!entryIds.length || fromMarketId === depoId) return 0
  // Yalnızca hâlâ o pazarda duran kalemler taşınır — arada başka bir işlemle
  // taşınmış olanlara karşılıksız Transfer logu düşmesin.
  const movable = await tx.entry.findMany({
    where: { id: { in: entryIds }, marketId: fromMarketId },
    select: { id: true },
  })
  if (!movable.length) return 0
  const ids = movable.map((e) => e.id)
  await tx.entry.updateMany({ where: { id: { in: ids } }, data: { marketId: depoId } })
  await tx.transfer.createMany({
    data: ids.map((entryId) => ({
      entryId,
      fromMarketId,
      toMarketId: depoId,
      note,
      createdBy,
    })),
  })
  return ids.length
}

// İrsaliye sil — Cascade ile ExitItem + CaseMovement + LedgerEntry düşer,
// kalemlerin malı depoya döner
export async function deleteExit(req, res, next) {
  try {
    const id = Number(req.params.id)
    const exit = await prisma.exit.findUnique({
      where: { id },
      include: { items: { select: { entryId: true } } },
    })
    if (!exit) return res.status(404).json({ error: 'İrsaliye bulunamadı' })

    const depo = await findDepoMarket()
    if (!depo) return res.status(404).json({ error: 'DEPO market kaydı bulunamadı' })

    const entryIds = exit.items.map((i) => i.entryId)
    // Admin auth tek şifre — req.user gerçek kişiyi göstermiyor. Silen kişi
    // modalda seçiliyor, izde o görünmeli (updateExit'teki editedBy ile aynı mantık).
    const createdBy = req.body?.deletedBy || req.user?.name || 'Admin'

    const returned = await prisma.$transaction(async (tx) => {
      await tx.exit.delete({ where: { id } })
      return returnEntriesToDepo(tx, {
        entryIds,
        fromMarketId: exit.marketId,
        depoId: depo.id,
        note: `İrsaliye #${id} silindi — mal depoya döndü`,
        createdBy,
      })
    })

    // Silen kişi modaldan geliyor (tek admin şifresi yüzünden req.user gerçek
    // kişiyi göstermiyor) — denetim satırında o isim de dursun.
    auditDelete(
      req, 'exit', id,
      `İrsaliye #${id} silindi · ${entryIds.length} kalem depoya döndü · silen: ${createdBy}`,
    )
    res.json({ deleted: id, returnedToDepo: returned })
  } catch (err) { next(err) }
}
