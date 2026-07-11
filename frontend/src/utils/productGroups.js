// Ürünleri ana ürün (groupName) → varyant olarak gruplar.
// Gruplama artık DB'deki Product.groupName alanından gelir (admin panelden yönetilir).
// groupName null olan ürünler tekil/ana ürün olarak tek kart gösterilir.

const GROUP_ICONS = {
  biber: '🫑', domates: '🍅', salatalık: '🥒', patlıcan: '🍆', kabak: '🥒',
  soğan: '🧅', sarmısak: '🧄', patates: '🥔', havuç: '🥕', kereviz: '🥬',
  marul: '🥬', ıspanak: '🥬', ispanak: '🥬', pazı: '🥬', semiz: '🥬', rokka: '🥬',
  maydanoz: '🌿', dere: '🌿', tere: '🌿', nane: '🌿', kekik: '🌿', golyandro: '🌿',
  brokoli: '🥦', enginar: '🌱', bamya: '🌱', bezelye: '🫛', bakla: '🫛',
  fasulye: '🫘', barbunya: '🫘', börülce: '🫘', darı: '🌽',
  elma: '🍎', armut: '🍐', ayva: '🍐', portakal: '🍊', mandalin: '🍊',
  greyfut: '🍊', bergamut: '🍊', pamelo: '🍊', limon: '🍋', turunç: '🍊',
  üzüm: '🍇', çilek: '🍓', dut: '🫐', karpuz: '🍉', kavun: '🍈',
  muz: '🍌', mango: '🥭', ananas: '🍍', avakado: '🥑', kaki: '🍅',
  şeftali: '🍑', kayısı: '🍑', nektarin: '🍑', erik: '🍑', kiraz: '🍒',
  nar: '🔴', incir: '🟣', hurma: '🌴', papaya: '🍈', ginnap: '🟢',
  ceviz: '🌰', çağla: '🌰', badem: '🌰', turp: '🥕', pancar: '🫜',
  sarma: '🍃', asma: '🍃', mersin: '🍃', nergis: '🌼',
}

function normalize(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ')
}

function upper(s) {
  return s.toLocaleUpperCase('tr')
}

export function getGroupIcon(label) {
  const first = String(label ?? '').toLocaleLowerCase('tr').split(' ')[0]
  return GROUP_ICONS[first] ?? '🌱'
}

// DB'de saklı emoji, yoksa grup ikonu
export function getProductIcon(product) {
  return product?.icon || getGroupIcon(product?.groupName || product?.name || '')
}

// Varyant etiketi — grup ön ekini çıkarır ("Portakal Kan" + grup "Portakal" → "Kan").
// Ön ek uymazsa (ör. "Ayşe Fasulye" grubu "Fasulye") tam adı gösterir. Türkçe-güvenli (upper karşılaştırma).
export function variantLabel(product, groupLabel) {
  const full = normalize(product.name)
  const g = normalize(groupLabel)
  if (g && upper(full).startsWith(upper(g) + ' ')) {
    return full.slice(g.length).trim()
  }
  return full
}

/**
 * @returns {{ key, label, icon, single, variants: object[] }[]} — alfabetik sıralı gruplar
 */
export function groupProducts(products) {
  const map = new Map() // groupName -> items[]
  const standalone = []
  for (const p of products) {
    const g = normalize(p.groupName)
    if (g) {
      if (!map.has(g)) map.set(g, [])
      map.get(g).push(p)
    } else {
      standalone.push(p)
    }
  }

  const groups = []
  for (const [g, items] of map) {
    groups.push({
      key: upper(g),
      label: g,
      icon: getGroupIcon(g),
      single: items.length === 1, // groupName atanmış ama tek üye → direkt seçilir
      variants: items,
    })
  }
  for (const p of standalone) {
    groups.push({
      key: upper(normalize(p.name)),
      label: normalize(p.name),
      icon: getProductIcon(p),
      single: true,
      variants: [p],
    })
  }
  groups.sort((a, b) => a.label.localeCompare(b.label, 'tr'))
  return groups
}
