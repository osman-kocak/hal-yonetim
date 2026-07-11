// Ürün adı → emoji ikon eşlemesi. seed.js kullanır; giriş/admin ekranları
// Product.icon dolu olduğunda bunu gösterir (frontend/utils/productGroups.getProductIcon).

// Tam ad override (acı biber, bal kabağı, taze baklagil pod'ları)
const OVERRIDE = {
  'Biber Acı Kırmızı': '🌶️', 'Biber Acı Yeşil': '🌶️', 'Biber Meksika Acı': '🌶️',
  'Kabak Bal': '🎃', 'Kabak Macunluk': '🎃',
  'Taze Börülce': '🫛', 'Taze Fasulye': '🫛',
}

// İlk kelimeye (ana ürün) göre emoji
const BY_KEY = {
  ACUR: '🥒', ALIÇ: '🔴', ASMA: '🍃', AVAKADO: '🥑', AYŞE: '🫛', AYVA: '🍐',
  BAKLA: '🫛', BAMYA: '🫛', BARBUNYA: '🫘', BERGAMUT: '🍊', BEZELYE: '🫛',
  BİBER: '🫑', BROKOLİ: '🥦', CEVİZ: '🌰', ÇAĞLA: '🌰', ÇİÇEK: '🥦', ÇİLEK: '🍓',
  DARI: '🌽', DERE: '🌿', DOMATES: '🍅', DRAGON: '🔴', DUT: '🫐', ELMA: '🍎',
  ENGİNAR: '🥬', ERİK: '🍑', GINNAP: '🟤', GOLYANDRO: '🌿', GÖMEÇ: '🌿',
  GREYFUT: '🍊', GUAFA: '🟢', GULUMBRA: '🥬', HAVUÇ: '🥕', HURMA: '🟠',
  ISPANAK: '🥬', İNCİR: '🟤', KABAK: '🥒', KAKİ: '🟠', KARPUZ: '🍉', KAVUN: '🍈',
  KAYISI: '🍑', KAYSI: '🍑', KEKİK: '🌿', KEREVİZ: '🥬', KOLOKAS: '🥔',
  LİMON: '🍋', LUANA: '🍈', MANDALİN: '🍊', MANDALİNA: '🍊', MANGO: '🥭',
  MARUL: '🥬', MAYDANOZ: '🌿', MERSİN: '🫐', MUZ: '🍌', NAR: '🔴', NEKTARİN: '🍑',
  NERGİS: '🌼', PAMELO: '🍊', PANCAR: '🫜', PAPAYA: '🟠', PATATES: '🥔',
  PATLICAN: '🍆', PAZI: '🥬', PORTAKAL: '🍊', PRATSA: '🧅', ROKKA: '🥬',
  SALATALIK: '🥒', SARI: '🫘', SARMA: '🥬', SARMISAK: '🧄', SEMİZ: '🥬',
  SOĞAN: '🧅', ŞEFTALİ: '🍑', TAZE: '🌿', TERE: '🌿', TURP: '🥕', TUTKU: '🟣',
  ÜZÜM: '🍇', YENİ: '🟠',
}

export function iconFor(name) {
  const n = String(name ?? '').trim().replace(/\s+/g, ' ')
  if (OVERRIDE[n]) return OVERRIDE[n]
  const first = n.split(' ')[0].toLocaleUpperCase('tr')
  return BY_KEY[first] ?? '🌱'
}
