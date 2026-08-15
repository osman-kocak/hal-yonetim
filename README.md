# Hal Yönetim Sistemi

> Sebze-meyve hali için **full-stack** stok, satış, cari hesap ve kasa takip sistemi.

Bölge bazlı mal kabulden başlayıp; depo yönetimi, pazar bazlı irsaliye kesimi, fiyat takibi, cari hesap (bayi/üretici) ve boş kasa hareketlerine kadar tüm operasyonu tek panelde birleştiren çok rollü bir web uygulaması.

---

## 🚀 Özellikler

- 📍 **Mal kabul akışı** — Bölge → Üretici → Ürün → Kasa/Kilo girişi (adım adım onboarding)
- ⚖️ **Üç satış birimi** — `Product.unit`: **Kilo** (`CASE`, tartılır), **Bağ** (`BUNCH`: maydanoz, marul, roka…) ve **Adet** (`PIECE`). Birim yalnızca **miktar eksenini** belirler: miktar her birimde `weight` kolonunda durur (kg / bağ / adet) ve fiyat o birimin fiyatıdır (₺/kg, ₺/bağ, ₺/adet). Toplamlar üç ayrı kovada tutulur — bağ ile adet toplanabilir sayı değil. Birim `Entry.unit`'e snapshot'lanır; ürünün birimi sonradan değişse de geçmiş irsaliye/rapor anlamını korur
- 🗑️ **Siyah/Karton kasa** — **Kasa sayımının tek belirleyicisi.** Tek kullanımlık kasada gelen mal işaretlenir (`Entry.disposableCase`) ve kasası hiçbir bakiyeye girmez (ne bölge, ne bayi, ne iade). İşaretlenmediyse kasa üç birimde de sayılır — bağ/adet malı da geri dönen kasayla geliyor. Zayıf Mal'dan bağımsız, ikisi birlikte seçilebilir
- 📦 **Depo yönetimi** — Ürün bazlı toplu transfer (FIFO mantığı + parçalı kasa ayırma/split, bağ ürünlerde adet ekseninde). Hedef pazar mal kabuldeki gibi **numara yazılarak** seçilir
- ↔️ **Pazardan pazara aktarma** — Yanlış pazara yazılan kalem, irsaliye kesilmeden önce çıkış ekranından doğru pazara aktarılır; geri alınabilir, kasa/cari hesap etkilenmez
- 📋 **Çıkış & Teslim Fişi** — iPad'de PDF → AirPrint, masaüstünde doğrudan yazdırma; fiyat snapshot (fiş sonradan fiyat değişse de sabit kalır)
- 💵 **Ürün başına tek fiyat** — `/admin/fiyatlar` ürün × kalite matrisiydi, artık tek sütun. Kalite özelliği kullanımdan kalktı: mal kabul ekranı zaten `qualityId` göndermiyordu, kaliteli fiyat satırları saha girişleriyle **hiç eşleşmiyor** ve irsaliyede fiyat boş kalıyordu. Eski kaliteli satırlar duruyor ve aramada hâlâ öncelikli (`priceOf()`: önce ürün+kalite, yoksa genel fiyat)
- 🔄 **İade kabul** — Ayrı ekran (`/iade`): depoya al, başka pazara yolla **veya** imha et (atomic: Entry + Ledger + CaseMovement)
- 💰 **Çoklu rol kullanıcı sistemi** — `ADMIN`, `DEPO`, `OPERATOR`, `ACCOUNTING`, `CASE_MANAGER`
- 🧺 **Boş kasa takibi** — İki yönlü: **bayi** tarafı (otomatik `MARKET_OUT` irsaliye ile) ve **bölge** tarafı (bölgeye verilen kasa `REGION_OUT`, mal kabulde otomatik `REGION_IN` düşümü) + manuel düzeltme hareketleri
- 📊 **Cari hesap** — Bayi alacak (irsaliye), üretici borç (manuel + ödeme)
- 📈 **Raporlar** — Günlük, pazar bazlı, ürün bazlı, top products
- 📥 **PDF + XLSX export** — Tüm liste sayfalarında (jsPDF + SheetJS, lazy-loaded). `/admin/takip` çıktısı **çok sekmeli**: irsaliyeler pazara, girişler bölgeye göre ayrı sekmelerde + baştaki "Tümü" sekmesi
- 📡 **Bağlantı izleme** — Ağ hatasında 3 kez üstel beklemeli retry; kesinti sürerse ekranın üstünde kalıcı uyarı şeridi. Kesinti süreleri `localStorage`'a yazılır (`hal_outages`) — offline mimarisi kararı bu veriye dayanacak. Mal kabul formu `sessionStorage`'da taslak tutar, yenileme/kesintide girilen satırlar kaybolmaz
- 📱 **Mobile-first responsive** — Tablolar mobilde otomatik gizleme/yığma
- 🔐 **JWT auth + role guard** — Frontend `ProtectedRoute` + backend middleware
- ⚡ **Performans optimize** — Vendor chunk split, PDF/XLSX lazy, auto-refresh `document.hidden` pause
- 📄 **Pagination** — `/admin/takip` (irsaliye + mal kabul geçmişi) sayfa bazlı (50/page)
- 🔎 **Bölge + üretici filtresi** — `/admin/takip?tab=girisler` ekranında bölge seçilince üretici listesi o bölgeye daralır (`allRegions` üreticiler her bölgede kalır). Filtre backend'de bölgeden bağımsız uygulanır — üreticinin kayıtları başka bölge oturumunda da durabiliyor
- 🍅 **Ürün emoji ikonları** — Her ürüne admin panelinden emoji atanabilir (🍅 Domates, 🍎 Elma…)
- 🔥 **Akıllı ürün sıralaması** — Mal kabul ekranındaki ürünler en çok girişi yapılana göre sıralanır (global)
- 🔄 **Üretici aktif/pasif** — Admin panelinde tek tıkla toggle; pasif üreticiler operatör ekranında görünmez, backend de blok eder (cari kayıtlar korunur)
- 🗂️ **Ana ürün gruplaması** — Ürünlere admin panelinden "Ana ürün" (`Product.groupName`) atanır; mal kabul ekranında ana ürün (Portakal) → tıkla → çeşitler (Kan, Şeker, Valensia…) açılır. Admin ürün listesi de gruplu gösterilir
- 🛡️ **Denetim kaydı (audit log)** — Hassas veri okuma ve export'ları kaydeder (`AuditLog`: kim, ne zaman, hangi kaynak, kaç satır). Admin panelinde `/admin/denetim` görüntüleyici; 200 satır üstü okuma anomali olarak işaretlenir. Export tarayıcıda üretildiği için istemci indirmeden önce niyet kaydı gönderir
- 🔥 **Fire / imha raporu** — `99 ATILAN` pazarına yazılan mallar (`/admin/fire`). İki kaynak: bayiden iade → imha, ya da depodaki malın 99'a transferi
- 🏷️ **Entry kaynak ayrımı** — `EntrySource` (`HARVEST` / `RETURN` / `DISCARD`). Raporlar yalnızca `HARVEST` sayar; iade ve imha entry'leri mal kabul hacmine karışmaz
- 🔒 **Rol bazlı ağ kısıtı** — Saha rolleri (`DEPO`, `OPERATOR`, `CASE_MANAGER`) yalnızca `HAL_ALLOWED_IPS`'teki hal hattından; `ADMIN` ve `ACCOUNTING` her yerden erişir. Kontrol `requireAuth` içinde, **her istekte** yapılır — hal içinde alınan token dışarı taşınırsa da çalışmaz. Prod'da `HAL_ALLOWED_IPS` tanımsızsa sunucu açılmaz. SSH ayrıca hal IP'sine kilitli
- 💧 **Ekran filigranı** — Saha panellerinde (`/mal-kabul`, `/cikis`, `/depo`, `/kasaci`) kullanıcı adı + tarih/saat çapraz filigran. Ekran fotoğraflanırsa görüntü kimin oturumuna ait olduğunu taşır. Admin/muhasebe panellerinde görünmez; `pointer-events: none`, yazdırmada gizli

---

## 🧱 Tech Stack

### Backend
- **Node.js 20+** + **Express 4**
- **Prisma ORM** + **PostgreSQL 14+**
- **JWT** (jsonwebtoken) + **bcrypt** (parola hash)
- ES Modules (`"type": "module"`)

### Frontend
- **React 19** + **Vite 8**
- **Tailwind CSS v3** (DESIGN_SYSTEM.md uyumlu)
- **Zustand** (state)
- **React Router 7**
- **lucide-react** (iconlar)
- **Recharts** (grafikler)

### Yazdırma / PDF / Excel
- **Teslim fişi yazdırma** — İki yol, aynı düzen:
  - **iPad (iOS):** `window.print()` iPad'de sessizce yutuluyor (buton basılı görünür, panel açılmaz). Bu yüzden `printIrsaliye()` iOS'ta PDF üretip yeni sekmede açar → kullanıcı **Paylaş → Yazdır** ile AirPrint'e verir. Sekme, popup engeline takılmasın diye dokunuşun kendisinde senkron açılır (`store/printStore.js`)
  - **Masaüstü:** HTML + `@media print` (`components/IrsaliyePrint.jsx`), `window.print()` ile doğrudan yazdırma
  - Sayfa düzeni ikisinde de aynı: sayfa başına **21 satır** (`PAGE_ROWS`, elle sayfalama), her sayfada header + footer, kenar boşluğu yok, imza yalnızca son sayfada
  - Sunucu veya yerel köprü gerektirmez; tarayıcıdan "sessiz" yazdırma iOS'ta mümkün değildir
  - Arkalı önlü basma PDF'ten kontrol edilemez (`/Duplex Simplex` ipucu gömülü ama AirPrint yok sayar) — iOS yazdırma panelindeki **"Çift Taraflı"** anahtarından kapatılır
- **jsPDF 4** + **jspdf-autotable 5** — Arial TTF font ile Türkçe karakter desteği (PDF arşiv/paylaşım için korunuyor)
- **SheetJS (xlsx 0.18)** — Excel export

### Deploy
- VPS + OpenLiteSpeed / nginx (statik frontend)
- **PM2** (backend process manager)
- `prisma migrate deploy` (schema push)
- Rsync over SSH (key tabanlı auth)

---

## 🗺️ Mimari Akış

```
        ┌─────────────────────────────────────────┐
        │            /giris (LoginPage)           │
        └────────────────────┬────────────────────┘
                             │ JWT
                             ▼
                ┌─────────────────────────┐
                │     /  (RoleSelect)     │  ← Tek rol varsa otomatik yönlendirir
                └────────────────────────-┘
        ┌───────┬──────────┬──────────┬─────────────┐
        ▼       ▼          ▼          ▼             ▼
  ┌─────────┐┌────────┐┌────────┐┌──────────┐┌────────────┐
  │/mal-kabul││ /cikis ││ /depo  ││ /kasaci  ││  /admin/*  │
  │OPERATOR ││ * any  ││ DEPO   ││CASE_MGR  ││ADMIN+ACC.  │
  └─────────┘└────────┘└────────┘└──────────┘└────────────┘
                                                    │
                            ┌───────────────────────┼───────────────────────┐
                            ▼                       ▼                       ▼
                       Dashboard            Fiyatlar/Finans          Raporlar/CRUD
```

---

## 📦 Kurulum

### Gereksinimler
- Node.js **20+**
- PostgreSQL **14+**
- npm **10+**

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env       # DATABASE_URL, JWT_SECRET düzenle
npm run db:push            # Prisma schema → DB
npm run db:seed            # Katalog verisi (ürün, pazar, kalite, ilk admin) + bölge/üretici import
npm run db:import-producers -- --dry-run   # Sadece bölge+üretici (idempotent, prod'da güvenli)
npm run dev                # http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                # http://localhost:5173
```

Frontend `/api/*` isteklerini Vite proxy ile `localhost:3001`'e yönlendirir.

### .env örneği

```env
DATABASE_URL="postgresql://USER:PASS@localhost:5432/hal_yonetim"
JWT_SECRET="gizli-anahtar-degistir"
JWT_EXPIRES_IN="8h"
PORT=3001
ADMIN_INITIAL_PASSWORD="admin123"
# Saha rollerinin (DEPO/OPERATOR/CASE_MANAGER) çalışabileceği IP'ler — virgülle ayrılır.
# Boş bırakılırsa kısıt uygulanmaz (yalnızca geliştirme); prod'da zorunlu.
HAL_ALLOWED_IPS="127.0.0.1,HAL_STATIK_IP"
```

> ⚠️ **Üretimde** `JWT_SECRET` ve `ADMIN_INITIAL_PASSWORD` **mutlaka** değiştirilmeli.
> `HAL_ALLOWED_IPS` prod'da tanımsızsa sunucu `FATAL` verip açılmaz — saha hesaplarının
> sessizce her yerden erişilebilir hale gelmesini engeller. Hal'in statik IP'si değişirse
> bu değer güncellenmeli (ADMIN her yerden girebildiği için sistem kilitlenmez).

---

## 👥 Roller ve Yetkiler

| Rol | Erişim Alanı |
|------|--------------|
| **ADMIN** | Tüm paneller (mal kabul, depo, çıkış, kasacı, admin) |
| **OPERATOR** | Mal kabul + çıkış (irsaliye) |
| **DEPO** | Depo transfer + iade kabul |
| **ACCOUNTING** | Admin paneli (raporlar + fiyat + finans + cari) |
| **CASE_MANAGER** | Kasa yönetimi paneli (bayi iadesi + bölgeye kasa verme, bakiyeler) |

> Bir kullanıcı **birden fazla role** sahip olabilir (`UserRole[]`). Tek rolü olan kullanıcı `/giris` sonrası otomatik ilgili panele yönlendirilir.

---

## 🔄 Temel İş Akışları

### Mal Kabul Akışı
```
RegionSelect → ProducerSelect → ProductSelect → EntryForm
                                                     │
                                                     ▼
                                    Entry kaydı + CaseMovement.REGION_IN
                            (bölgeye verilen boş kasa dönmüş sayılır, otomatik)
```
Giriş başına bir kasa hareketi üretilir (`entryId` unique). Giriş silinirse hareket
cascade ile silinir, kasa adedi düzenlenirse hareket de güncellenir — bölge bakiyesi
mal kabul kayıtlarıyla her zaman tutarlı kalır.

### İrsaliye / Çıkış Akışı
```
ExitPage (pazar listesi, bekleyen entry sayıları)
        │
        ▼
MarketExitDetail (entry checkbox listesi + fiyat özeti)
        │
        ▼
"İrsaliye Oluştur" → Yazdır (iPad: PDF sekmesi → Paylaş → Yazdır | masaüstü: yazdırma ekranı)
        │
        ▼
Otomatik: Exit + ExitItem + CaseMovement.MARKET_OUT + LedgerEntry.MARKET_INVOICE
(fiyat snapshot ExitItem.pricePerKg'ye yazılır)
```

**Fişin başlığındaki bayi özeti (2026-08-15)**

Teslim fişinin üstünde Fiş No / Tarih / Pazar bilgisinin yanında üç alan daha var:
**İrsaliye Kasa**, **Toplam Kasa Bakiyesi** ve kırmızı **Toplam Borç**. Fiş elden
teslim edildiği için "kaç kasam var, ne kadar borcum var" sorusu kâğıdın üstünde
cevaplanır.

Rakamlar **basım anına** aittir, fişin kesildiği ana değil — `Exit`'e dondurulmuş
bir kolon yazılmadı, dolayısıyla eski bir fiş yeniden basılınca üstünde bugünkü
bakiye çıkar.

Veri, `exit` payload'ının **içinde** gelir; yazdırma anında API çağrısı yapılamaz
çünkü `printIrsaliye()` senkron olmak zorunda (iOS yazdırma izni `await`ten sonra
düşüyor). Hesap tek yerde: [`backend/src/utils/marketSummary.js`](backend/src/utils/marketSummary.js) —
işaret mantığını `caseMovementController` ve `ledgerController`'ın kendi
`signFor()` fonksiyonlarından **import eder**, kopyalamaz. İrsaliyedeki kasa sayısı
`trackedCases` ile hesaplanır (siyah/karton hariç), yani kasa bakiyesine giren
sayıyla birebir tutarlıdır.

Gövde, imza bloğu ve yeşil footer aynı **6mm** kenar payını paylaşır; HTML
(`index.css`) ve PDF (`pdfGenerator.js`) bu geometride lockstep'tir.

**Silme / kalem çıkarma (admin → `/admin/takip`)**

İrsaliye silinince (`DELETE /admin/exits/:id`) veya düzenlemede bir kalem
çıkarılınca (`PUT /admin/exits/:id`), o kalemlerin malı **otomatik depoya döner**
ve `Transfer` kaydına `İrsaliye #N silindi — mal depoya döndü` notu düşer.

Aksi hâlde `Entry` pazarda kalıyor, çıkış ekranında sebebi belirsiz bir "bekleyen
kalem" olarak yeniden beliriyor ve depoya dönmesi için operatörün elle "depoya al"
demesi gerekiyordu. Bayi borcu (`LedgerEntry`) ve kasa hareketi (`CaseMovement`)
zaten cascade/senkronizasyon ile geri alınıyor. Silen kişi modalda seçilir,
`Transfer.createdBy`'ye yazılır.

### İade Akışı
```
Bayiden iade → /iade ekranı (ana menü kartı veya depo panelindeki "İade Kabul")
        │
        ▼
Tek transaction'da:
  • Entry (depoya geri / opsiyonel)
  • LedgerEntry.MARKET_ADJUSTMENT (alacak düşümü)
  • CaseMovement.MARKET_IN (boş kasa iadesi)
"Atılan" işaretliyse → Entry oluşturulmaz, sadece ledger düşümü
```

### Bölge Kasa Akışı
```
Pazardan boş kasa gelir → CaseMovement.MARKET_IN   (kasacı girer)
        │
        ▼
Bölgeye kasa verilir    → CaseMovement.REGION_OUT  (kasacı girer)   bakiye +
        │                  "bahçeden mal toplansın diye verilen boş kasa"
        ▼
O bölgeden mal kabul    → CaseMovement.REGION_IN   (otomatik, Entry) bakiye −
```
Bölge bakiyesi = o bölgenin üstünde duran kasa. `REGION_IN` elle girilemez;
düzeltme için `REGION_ADJUST` (signed) kullanılır. Eksi bakiyeye izin verilir
(verilenden fazla kasa dönebilir), kasacı `REGION_ADJUST` ile kapatır.

### Transfer (Depo)
```
DepoTransferPage → Ürün grubu seç → Hedef pazar + kasa + tartılan kilo
        │
        ▼
FIFO: en eski Entry'lerden başlanır, gerekirse split yapılır
        │
        ▼
Girilen kilo, kapsanan Entry'lerin kilo payları oranında dağıtılır
        │
        ▼
Transfer kaydı + ilgili Entry'lerin marketId ve weight'i güncellenir
```
Kilo **zorunlu** (`requestedWeight`). Depodaki kilo mal kabuldeki değerdir; mal
beklerken fire verdiği için sevkiyatta tartılan değer esas alınır — irsaliye
tutarı bunun üzerinden hesaplanır. Kurallar:

- Tartı, o kasa adedine düşen kayıtlı kilodan **fazla olamaz** (400) — depoda
  karşılığı olmayan kilo yaratmamak için. Mal beklerken ağırlaşmaz.
- Aradaki fark = fire; `Transfer.note`'a `Tartı farkı: -X kg` olarak yazılır.
- Kısmî tüketilen Entry depoda kendi oransal payını korur, fark giden mala yazılır.
- Kasa yazılınca kilo alanı depo ortalamasından ön-doldurulur; kullanıcı tartıdaki
  değeri üstüne yazar.

---

## 🛣️ API Endpoint Özeti

| Prefix | Sorumluluk |
|--------|------------|
| `/api/auth/*` | Login + token refresh |
| `/api/entry/*` | Mal kabul (Entry CRUD) |
| `/api/exit/*` | İrsaliye listesi + oluşturma + PDF data |
| `/api/depo/*` | Pazar arası transfer (FIFO + split) |
| `/api/cases/*` | CaseMovement CRUD (bayi + bölge); `balances/markets`, `balances/regions` |
| `/api/region/*` | RegionSession (aktif/tamamlanan) |
| `/api/markets/*` | Pazar listesi (public dahil) |
| `/api/admin/*` | Region/Producer/Product/Quality/User CRUD + raporlar + finans + iade |
| `/api/public/*` | Ortak listeler (bölge, üretici, ürün) |

> Tüm yazma uçları `requireAuth` + rol middleware. Detay için `backend/src/routes/`.

---

## 📂 Sayfa Yapısı (Frontend Routes)

| URL | Rol | Açıklama |
|-----|-----|----------|
| `/giris` | public | Tek giriş sayfası (eski `/admin/giris`, `/depo/giris` buraya redirect) |
| `/` | auth | Rol seçimi (tek rolde otomatik yönlendir) |
| `/mal-kabul` | OPERATOR, ADMIN | 5 adımlı mal kabul wizard |
| `/cikis` | any auth | Pazar bazlı çıkış listesi |
| `/cikis/:marketId` | any auth | İrsaliye kesim ekranı → teslim fişi yazdırma (iPad: PDF → AirPrint) |
| `/depo` | DEPO, ADMIN | Toplu transfer |
| `/iade` | DEPO, ADMIN | Bayiden mal iadesi (depoya / başka pazara / imha) + son iadeler |
| `/kasaci` | CASE_MANAGER, ADMIN | Kasa hareketleri |
| `/admin` | ADMIN, ACCOUNTING | Dashboard |
| `/admin/fiyatlar` | ADMIN, ACC. | Günlük fiyat girişi — ürün başına TEK fiyat |
| `/admin/finans` | ADMIN, ACC. | Bayi alacak / Üretici borç cari |
| `/admin/takip` | ADMIN, ACC. | Geçmiş hareket logu |
| `/admin/kasalar` | ADMIN, ACC. | Kasa hareketleri raporu |
| `/admin/transferler` | ADMIN, ACC. | Transfer geçmişi |
| `/admin/iadeler` | ADMIN, ACC. | İade kayıtları |
| `/admin/kullanicilar` | ADMIN | Kullanıcı CRUD + rol atama |
| `/admin/bolgeler` | ADMIN, ACC. | Bölge CRUD |
| `/admin/ureticiler` | ADMIN, ACC. | Üretici CRUD (bölgeye bağlı) |
| `/admin/urunler` | ADMIN, ACC. | Ürün CRUD |
| `/admin/pazarlar` | ADMIN, ACC. | Pazar/Bayi CRUD |
| `/admin/kaliteler` | ADMIN, ACC. | Kalite CRUD — **menüden kaldırıldı**, kalite kullanılmıyor (route geçmiş düzeltmesi için duruyor) |
| `/admin/raporlar` | ADMIN, ACC. | Günlük/pazar/ürün/top products |
| `/admin/fire` | ADMIN, ACC. | Fire/imha raporu (99 ATILAN pazarı) |
| `/admin/denetim` | ADMIN | Denetim kaydı görüntüleyici (anomali işaretli) |

---

## 🗄️ Domain Modeli (Prisma)

Ana entity'ler:

- **Region** — Bölge (üreticilere ve bölge oturumlarına bağlı)
- **Producer** — Üretici (bölgeye opsiyonel bağlı; `allRegions=true` ise her bölgenin listesinde görünür)
- **RegionSession** — Bir bölgenin gün içi mal kabul oturumu (`ACTIVE`/`COMPLETED`)
- **Product / Quality** — Ürün ve kalite katalog (`Product.groupName` → ana ürün gruplaması, nullable). `Product.unit: ProductUnit` (`CASE`/`BUNCH`/`PIECE`) → satış birimi (kilo / bağ / adet). **Quality kullanımdan kalktı** (2026-08-13): mal kabul zaten kalite göndermiyordu, fiyat ürün başına tek. Tablo ve `Entry.qualityId`/`ReturnRecord.qualityId` alanları geçmiş kayıtlar için duruyor
- **Market** — Pazar/bayi (`no` unique numara)
- **Entry** — Mal kabul kaydı (Product + Producer + Quality + Market + kasa/miktar). `source: EntrySource` (`HARVEST`/`RETURN`/`DISCARD`) — raporlar yalnızca `HARVEST` sayar. `unit` birim snapshot'ı, `disposableCase` tek kullanımlık kasa işareti
- **Exit / ExitItem** — İrsaliye + içerdiği Entry'ler (fiyat snapshot)
- **Transfer** — Pazardan pazara taşıma geçmişi
- **Price** — Günlük fiyat. `qualityId` **nullable**: NULL = ürünün genel fiyatı (yeni standart, kalite kullanımdan kalktı), dolu = eski kaliteli satır. Arama iki katmanlı — önce ürün+kalite, yoksa genel: **tek karar noktası [`backend/src/utils/prices.js`](backend/src/utils/prices.js) → `priceOf()`**. Genel fiyatın tekilliğini partial unique index sağlar; `@@unique` NULL'lu satırları kapsamaz (Postgres'te iki NULL eşit sayılmaz)
- **LedgerEntry** — Bayi/üretici cari hesap kaydı (`MARKET_INVOICE`, `PAYMENT`, `ADJUSTMENT`, …)
- **CaseMovement** — Boş kasa hareketi. Bayi tarafı (`MARKET_OUT/IN/INIT/ADJUST`, `marketId`) ve bölge tarafı (`REGION_OUT/IN/ADJUST`, `regionId`). `REGION_IN` mal kabulle otomatik doğar, `entryId` ile girişe bağlıdır (unique + cascade). **Hangi kaydın kasa hesabına gireceğine tek yer karar verir: [`backend/src/utils/cases.js`](backend/src/utils/cases.js) → `trackedCases()`** — yalnızca siyah/karton kasa 0 döner; birim karışmaz (2026-08-13'te değişti, önce `BUNCH` da 0 dönüyordu)
- **ReturnRecord** — Bayiden iade (atomic Entry + Ledger + CaseMovement bağlar)
- **User** — Sistem kullanıcısı + `roles: UserRole[]`
- **AuditLog** — Hassas veri erişim/export kaydı (`action`, `resource`, `recordCount`, `ip`, `userAgent`). `username` denormalize: hesap silinse de iz kalır

Detay: [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma)

---

## 🚢 Deploy

### Tek komutla deploy

```bash
./scripts/deploy.sh            # backend + frontend
./scripts/deploy.sh backend    # sadece backend
./scripts/deploy.sh frontend   # sadece frontend
```

Script şunları yapar:
- Rsync ile dosyaları VPS'e gönderir (node_modules, .env, log hariç)
- VPS'te `npm ci --omit=dev`
- `prisma generate` + `prisma migrate deploy`
- PM2 reload/start (`hal-yonetim`)
- Frontend için lokal `vite build` → `dist/` → uzak sunucudaki public dizine kopyalanır

### Konfigürasyon
`scripts/deploy.sh` yerel `scripts/deploy.env` dosyasından bilgileri okur. Örnek:
```bash
cp scripts/deploy.env.example scripts/deploy.env
# deploy.env'yi kendi VPS bilgilerinle düzenle (host, port, key path, remote yollar, pm2 name)
```
`deploy.env` `.gitignore`'da, repoya gitmez. Web server olarak OpenLiteSpeed veya nginx kullanılabilir.

### Bağ/adet ürünlerine geçiş (tek seferlik)

Şema migration'ı hiçbir ürünün birimini değiştirmez — hepsi `CASE` başlar.
Bağ/adetle satılan ürünleri çevirmek ayrı bir script:

```bash
npm run db:set-bunch              # kontrol et, DEĞİŞTİRME (dry run)
npm run db:set-bunch -- --apply   # uygula
```

**Gün sonu, tüm irsaliyeler kesildikten sonra çalıştırılmalı.** Script bunu kendi
de zorluyor: listedeki ürünlerin irsaliyesi kesilmemiş girişi varsa iptal eder.
Sebep — o girişler `Entry.unit='CASE'` snapshot'ıyla kilo olarak durur, ama
muhasebeci ertesi gün fiyat hücresine ₺/bağ girmeye başlar; faturaları
₺/bağ × kilo çıkardı. Geçişten sonra muhasebeciye bildirilmeli.

Migration olarak yazılmadı çünkü `prisma migrate deploy` her deploy'da bekleyen
tüm migration'ları uygular — bu geçişin zamanlaması deploy'a bağlanamaz.

### Adet ürünlerine geçiş (tek seferlik)

`PIECE` birimi şemaya eklendi (migration `20260813180000_product_unit_piece`) ama
hiçbir ürünü çevirmez. Adetle satılan ürünler ayrı script ile ayrılır — bağ
listesi olduğu gibi kalır:

```bash
# scripts/set-piece-products.js içindeki PIECE_PRODUCT_IDS listesi doldurulur
npm run db:set-piece              # kontrol et, DEĞİŞTİRME (dry run)
npm run db:set-piece -- --apply   # uygula
```

`BUNCH → PIECE` finansal olarak nötrdür (fiyat iki tarafta da "sayı başına"),
`CASE → PIECE` değildir — script kilo biriminden gelen ürünlerde fiyat/tutar
kaydı varsa durur.

---

## 🧪 Manuel Test Checklist

### Mal Kabul
- [ ] Bölge seç → bölge oturumu açılır
- [ ] Üretici → Ürün → Form akışı kesintisiz (kalite adımı yok)
- [ ] Geçersiz kasa/kilo → Türkçe hata mesajı
- [ ] "Bölge Bitti" → özet (giriş/kasa/kilo) → onay → bölge listesine dön
- [ ] Mal kabul `REGION_IN` kasa hareketi üretir (bölgeye verilen kasa döndü sayılır) —
      yalnızca siyah/karton kasa işaretliyse ÜRETMEZ; bağ/adet ürünlerinde de
      üretir (bkz. `utils/cases.js`)

### Çıkış / İrsaliye
- [ ] Pazarlar bekleyen entry sayısıyla listelenir
- [ ] Entry seçimi → özet (kasa, kilo, tutar) güncellenir
- [ ] PDF Türkçe karakter doğru (Arial TTF)
- [ ] İrsaliye sonrası Exit + ExitItem + Ledger + CaseMovement oluşur
- [ ] `pricePerKg` snapshot doğru kayıt edilir
- [ ] Fiş başlığında İrsaliye Kasa / Toplam Kasa Bakiyesi / kırmızı Toplam Borç
- [ ] Başlıktaki "İrsaliye Kasa", kasa bakiyesindeki artışla aynı (siyah kasa hariç)
- [ ] Geçmişten yeniden bas → bakiye/borç **bugünkü** değerle çıkar
- [ ] Tablo, imzalar ve yeşil footer aynı hizada bitiyor (6mm); PDF ile HTML aynı

### Admin
- [ ] Yanlış şifre → "Şifre hatalı"
- [ ] Sayfa yenilemede oturum korunur
- [ ] CRUD sayfaları (region/producer/product/market) ekleme/silme/güncelleme
- [ ] Raporlar tarih filtresiyle çalışır
- [ ] PDF + XLSX export çalışır
- [ ] `/admin/takip` Excel çıktısı çok sekmeli: "Tümü" + pazar/bölge sekmeleri, satır sayısı ekranla uyuşur
- [ ] `/admin/takip?tab=girisler`: bölge seç → üretici listesi daralır → üretici seç → liste süzülür;
      bölge değişince üretici filtresi sıfırlanır

### Fiyat (ürün başına tek)
- [ ] `/admin/fiyatlar` tek "Fiyat" sütunu; kalite sütunları yok
- [ ] Fiyat gir → çık → otomatik kaydolur; sayfayı yenile, değer duruyor
- [ ] Aynı ürüne ikinci kez fiyat gir → yeni satır açılmaz, mevcut güncellenir
      (partial unique index: ürün+gün başına tek genel fiyat)
- [ ] **Fiyat değiştirilene kadar geçerli:** dün 10 TL girilen ürün bugün de 10 TL
      okunur; kutunun altında "12 Ağu'tan devir" notu görünür
- [ ] Devralınan fiyata dokunmadan alandan çık → yeni kayıt açılmaz (geçmiş şişmez)
- [ ] Geçmiş tarih seç → o güne kadarki **en son** fiyat görünür, sonraki günlerin
      zammı sızmaz
- [ ] Kalitesiz mal kabul girişi → çıkış ekranında fiyat **görünür** (eskiden "—" kalıyordu)
- [ ] Fiyatı girilmemiş ürün → irsaliyede "—", tutara 0 yazılmaz
- [ ] Menüde "Kaliteler" yok; `/admin/kaliteler` adresi elle açılınca hâlâ çalışır
- [ ] Kalite sütunu hiçbir ekranda yok: takip (iki tablo + Excel), çıkış, transfer
      (tablo + Excel), depo elle giriş, irsaliye düzenleme
- [ ] Transfer Excel'inde "Miktar" + "Birim" kolonları ayrı; bağ transferi "kg" yazmıyor

### Birim ve kasa (kilo / bağ / adet + siyah kasa)
- [ ] Bağ ürününde (Maydanoz) mal kabulde miktar alanı "Bağ", **Kasa alanı görünür ve opsiyonel**
- [ ] Adet ürününde miktar alanı "Adet", fiyat hücresi **₺/adet**
- [ ] 15 ₺/bağ fiyatla 150 bağ irsaliye → tutar **2.250 ₺**
- [ ] Bağ girişi kasayla yapıldı (siyah kasa işaretsiz) → bölge kasa bakiyesi **artar**
- [ ] Aynı giriş siyah kasa işaretliyse → bölge kasa bakiyesi **değişmez**
- [ ] Karışık irsaliye (20 kasa domates + 30 bağ marul + 8 adet lahana) → tek fişte
      Kasa kolonu üç satırda da dolu, Miktar kolonu "340,00 kg" / "30 bağ" / "8 adet"
- [ ] İrsaliye yazdır: ekran çıktısı ile PDF birebir aynı (aynı sayfalama, aynı hücreler)
- [ ] Bağ transferi: 100 bağ / 10 kasa depoda, 40 bağ transfer → kalan 60 bağ / 6 kasa,
      **tartı farkı notu çıkmaz** (kasa miktarla orantılı bölünür, toplam korunur)
- [ ] Depo, çıkış, fire ve rapor ekranlarında kg / bağ / adet **ayrı kartlarda** toplanır
- [ ] Siyah kasa işaretli giriş → bölge kasa bakiyesi artmaz; irsaliye kesilince bayi kasa borcu artmaz
- [ ] Zayıf + Siyah kasa birlikte işaretlenebilir, depo ekranında ayrı grup olur

### Pazar → pazar aktarma
- [ ] Yanlış pazardaki kalem → "Başka pazara aktar" → hedef pazarda görünür
- [ ] Kaynak pazarda gri satır "#N … pazarına aktarıldı", "Geri al" çalışır
- [ ] İrsaliyesi kesilmiş kalemde 409 hatası

---

## 📁 Klasör Yapısı

```
hal-yonetim/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # Domain modeli
│   │   ├── seed.js                # Test verisi + ilk admin
│   │   └── migrations/
│   ├── src/
│   │   ├── routes/                # admin, depo, cases, entry, exit, region, market, public, index
│   │   ├── controllers/
│   │   ├── middleware/            # requireAuth, requireRole
│   │   ├── utils/
│   │   ├── index.js               # Express app
│   │   └── server.js              # listen
│   └── tests/api.http
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Entry/             # Mal kabul wizard
│       │   ├── Exit/              # İrsaliye
│       │   ├── Depo/              # Transfer
│       │   ├── CaseManager/       # Kasa paneli
│       │   ├── Admin/             # 17 admin sayfası
│       │   ├── LoginPage.jsx
│       │   ├── RoleSelectPage.jsx
│       │   └── NotFoundPage.jsx
│       ├── components/
│       │   ├── ui/                # Button, Input, Table, Modal, Toast, …
│       │   └── ProtectedRoute.jsx
│       ├── store/                 # Zustand stores
│       ├── services/              # axios + API çağrıları
│       ├── utils/                 # pdf, xlsx, format helpers
│       └── App.jsx
└── scripts/
    └── deploy.sh                  # Hostinger VPS deploy
```

---

## 📜 Lisans

**MIT License** — açık kaynak. Detay için [LICENSE](LICENSE) dosyasına bakın.

Bu proje topluluk katkısına açıktır. Pull request'ler ve issue'lar memnuniyetle karşılanır.

## 📞 İletişim

- **Biapp Yazılım**
- Email: **osmankocak@bi-siparis.com**
- Tel / WhatsApp: **+90 533 846 12 60**
