# Hal Yönetim Sistemi

> Sebze-meyve hali için **full-stack** stok, satış, cari hesap ve kasa takip sistemi.

Bölge bazlı mal kabulden başlayıp; depo yönetimi, pazar bazlı irsaliye kesimi, fiyat takibi, cari hesap (bayi/üretici) ve boş kasa hareketlerine kadar tüm operasyonu tek panelde birleştiren çok rollü bir web uygulaması.

---

## 🚀 Özellikler

- 📍 **Mal kabul akışı** — Bölge → Üretici → Ürün → Kasa/Kilo girişi (adım adım onboarding)
- ⚖️ **Üç satış birimi** — `Product.unit`: **Kilo** (`CASE`, tartılır), **Bağ** (`BUNCH`: maydanoz, marul, roka…) ve **Adet** (`PIECE`). Birim yalnızca **miktar eksenini** belirler: miktar her birimde `weight` kolonunda durur (kg / bağ / adet) ve fiyat o birimin fiyatıdır (₺/kg, ₺/bağ, ₺/adet). Toplamlar üç ayrı kovada tutulur — bağ ile adet toplanabilir sayı değil. Birim `Entry.unit`'e snapshot'lanır; ürünün birimi sonradan değişse de geçmiş irsaliye/rapor anlamını korur
- 🗑️ **Siyah/Karton kasa** — **Kasa sayımının tek belirleyicisi.** Tek kullanımlık kasada gelen mal işaretlenir (`Entry.disposableCase`) ve kasası hiçbir bakiyeye girmez (ne bölge, ne bayi, ne iade). İşaretlenmediyse kasa üç birimde de sayılır — bağ/adet malı da geri dönen kasayla geliyor. Zayıf Mal'dan bağımsız, ikisi birlikte seçilebilir
- 📦 **Depo yönetimi** — Ürün bazlı toplu transfer (FIFO mantığı + parçalı kasa ayırma/split, bağ ürünlerde adet ekseninde). Hedef pazar mal kabuldeki gibi **numara yazılarak** seçilir
- 🏬 **Depo giriş-çıkış geçmişi** — `/admin/depo` → **Geçmiş** sekmesi: bir günde depoya ne girdi, ne çıktı ve **kim yaptı**. Stok sekmesi bu soruyu CEVAPLAYAMAZ — `Entry.marketId` canlı konum alanı olduğu için depodan çıkan mal stok listesinden tamamen kaybolur, yani gün içinde girip aynı gün çıkan mal hiç olmamış gibi görünür. Uç, `Entry` ve `Transfer` tablolarını **tek zaman çizelgesinde birleştirir**: doğrudan depo girişleri (saha mal kabulü, ofis girişi, iade) `Transfer` satırı doğurmaz, yalnız transferlere bakmak bu hareketleri kaçırırdı. Bir girişin **kaynağı** en eski `Transfer.fromMarketId`'den, o yoksa güncel `marketId`'den çözülür. Kasa adedi `Entry.purchaseCases` snapshot'ından okunur (`caseCount` kısmî transferde parçadan düşülüyor, geçmiş sessizce eksik toplardı). Tarih aralığı, yön (giriş/çıkış), metin araması, sayfalama ve Excel/PDF export var
- ↔️ **Pazardan pazara aktarma** — Yanlış pazara yazılan kalem, irsaliye kesilmeden önce çıkış ekranından doğru pazara aktarılır; geri alınabilir, kasa/cari hesap etkilenmez
- 📋 **Çıkış & Teslim Fişi** — iPad'de PDF → AirPrint, masaüstünde doğrudan yazdırma; fiyat snapshot (fiş sonradan fiyat değişse de sabit kalır); **fişte satır = ÜRÜN, kayıt değil** — aynı ürünün farklı mal kabul kayıtları (farklı gün/parti, transferde bölünme) tek satırda toplanır. Birleştirme yalnızca **fişte görünen alanların tamamı** aynıysa yapılır (ürün + birim + net fiyat + normal fiyat), ayrışan tek şey `Entry` kimliğidir ve o zaten basılmıyor — çıktıdan bilgi kaybolmaz. Ekran fişi ve PDF **aynı fonksiyondan** beslenir (`utils/pdfGenerator.js` → `irsaliyeRows()`), ayrışamazlar. Kozmetiktir: veritabanı, kasa hareketi, cari borç ve admin geçmiş ekranı kayıt bazında kalır
- 🏷️ **İndirimli satış fiyatı** — `/admin/fiyatlar` satış sekmesinde iki alan: **Normal Fiyat** (indirim öncesi) ve **Net Fiyat** (fatura bundan kesilir). Normal boşsa indirim yok, tek fiyat geçerli. Dolu ve net'ten büyükse teslim fişinde **"70 → 50"** olarak basılır (normal fiyat üstü çizili) — bayi indirimi görür, fatura yine net tutardan hesaplanır. `Price.listPricePerKg` yalnız GÖSTERİM: `pricePerKg` anlamını korudu (uygulanacak tutar), bu yüzden fiyat okuyan hiçbir kod değişmedi. `ExitItem.listPricePerKg` snapshot'lanır, fiyat sonradan değişse eski fiş aynı indirimi gösterir. İndirim carry-forward'a tabi (değiştirilene kadar geçerli) ve tüm bayilere uygulanır. Normal < net girilirse 400 döner (alanlar karıştırılmış demektir), normal = net girilirse indirim yok sayılır — sahte "%0 indirim" basılmaz
- 💵 **Ürün başına tek fiyat** — `/admin/fiyatlar` ürün × kalite matrisiydi, artık tek sütun. Kalite özelliği kullanımdan kalktı: mal kabul ekranı zaten `qualityId` göndermiyordu, kaliteli fiyat satırları saha girişleriyle **hiç eşleşmiyor** ve irsaliyede fiyat boş kalıyordu. Eski kaliteli satırlar duruyor ve aramada hâlâ öncelikli (`priceOf()`: önce ürün+kalite, yoksa genel fiyat)
- 🔄 **İade kabul** — Ayrı ekran (`/iade`): depoya al, başka pazara yolla **veya** imha et (atomic: Entry + Ledger + CaseMovement)
- 💰 **Çoklu rol kullanıcı sistemi** — `ADMIN`, `DEPO`, `OPERATOR`, `ACCOUNTING`, `CASE_MANAGER`
- 🧺 **Boş kasa takibi** — İki yönlü: **bayi** tarafı (otomatik `MARKET_OUT` irsaliye ile) ve **bölge** tarafı (bölgeye verilen kasa `REGION_OUT`, mal kabulde otomatik `REGION_IN` düşümü) + manuel düzeltme hareketleri
- 📊 **Cari hesap** — Bayi alacak (irsaliye otomatik), üretici borç (**mal kabulde otomatik**) + ödeme
- 🤝 **Üretici ödeme paneli** — `/admin/uretici-odeme`. Mal kabul kaydedildiği anda üreticiye borç yazılır (`PRODUCER_DEBT`, `LedgerEntry.entryId` ile mal kabule bağlı). Panel: bakiye listesi (kümülatif kalan + dönemsel mal bedeli/ödenen), üretici detayı (hesap ekstresi + **mal kabul dökümü** + ödeme geçmişi), tek ve **toplu ödeme** (bakiyeleri kapat / sabit tutar / toplam dağıt — tek transaction, `clientId` ile idempotent), nakit/havale/çek ayrımı, A4 iki nüshalı **imzalı makbuz**, Excel/PDF export. Ödeme silme ve toplu yeniden hesaplama yalnız `ADMIN`
- 💸 **Alış fiyatı (satıştan bağımsız)** — İş modeli alım-satım: üreticiden mal ayrı bir **alış** fiyatıyla alınır, bayiye ayrı **satış** fiyatıyla kesilir; komisyon/stopaj YOK. `/admin/fiyatlar` üç sekmeli — satış, alış ve üretici özel fiyatı; her sekmede iki fiyat yan yana ve **marj kolonu** (alış > satış ise kırmızı uyarı, zararına satış girişte yakalanır). Alış fiyatı **ticari sırdır**: saha rollerine (`OPERATOR`/`DEPO`/`CASE_MANAGER`) hiçbir uçtan sızmaz — koruma `middleware/purchaseGuard.js`'te *fail-closed* (varsayılan gizle, `/admin` hariç), yeni bir saha ucu eklendiğinde otomatik korunur
- 🎚️ **Üç katmanlı alış fiyatı** — Sırayla: **(1)** üretici+ürün+gün özel fiyatı → **(2)** üreticinin yüzde primi/iskontosu (`Producer.pricePremiumPct`, ör. +%5) → **(3)** genel alış fiyatı. Fallback zinciridir, formül değil: **özel fiyat varsa prim UYGULANMAZ** (özel fiyat zaten o sapmanın kendisi; üstüne prim eklemek çift sapma yazar ve muhasebeci 14,00 girip 14,70 görürse özelliği bir daha kullanmaz). Uygulanan fiyat + kaynağı `Entry.purchasePricePerKg` / `purchasePriceSource` ile **snapshot**'lanır — fiyat sonradan değişse geçmiş borç sabit kalır. Tek karar noktası: [`backend/src/utils/purchasePrices.js`](backend/src/utils/purchasePrices.js)
- ⚠️ **Fiyatsız mal kabul uyarısı** — Alış fiyatı girilmemişse borç **yazılmaz** (0 yazılmaz: sıfır "bedava aldık", yok "muhasebeci girmedi" demek). O kayıtlar panelin "Fiyatsız Mal Kabul" sekmesinde **ürün bazında gruplu** birikir; fiyat sonradan girilip *Yeniden Hesapla* çalıştırılınca borçlar üretilir (**idempotent** — borcu yazılmış kayda ikinci kez yazmaz). Üreticisi seçilmemiş girişlere aynı ekrandan üretici atanır ve borç o anda doğar
- 🔥 **Fire de ödenir** — `99 ATILAN`'a giden, `weak` işaretli ve siyah kasadaki mal da üretici borcu yazar; `source`/`weak`/`disposableCase` ayrımı yapılmaz. Depo transferinde mal **yeniden tartıldığı** için `Entry.weight` değişebiliyor — bu yüzden borç `weight`'ten değil mal kabul anındaki `Entry.purchaseQty` snapshot'ından hesaplanır; dökümde "alınan 100 kg · güncel stok 97 kg (3 kg fire)" olarak görünür
- 📈 **Raporlar** — Günlük, pazar bazlı, ürün bazlı, top products
- 📥 **PDF + XLSX export** — Tüm liste sayfalarında (jsPDF + SheetJS, lazy-loaded). `/admin/takip` çıktısı **çok sekmeli**: irsaliyeler pazara, girişler bölgeye göre ayrı sekmelerde + baştaki "Tümü" sekmesi
- 📡 **Offline mal kabul (Faz 1)** — Kesintide mal kabul girişleri iPad'de **IndexedDB kuyruğuna** yazılır, bağlantı gelince FIFO sırayla gönderilir. Form önce doğrudan göndermeyi dener, YALNIZCA ağ hatasında kuyruğa düşer (validasyon hatası kuyruğa girmez). Her istek `clientId` taşır ve backend `SyncedBatch` ile aynı kaydı iki kez yazmaz — timeout "istek gitmedi" demek değil. Service worker uygulama kabuğunu önbelleğe alır: sunucu tamamen kapalıyken bile ekran açılır, pazar/ürün/üretici listeleri cache'ten gelir. **Faz 2'de iade de eklendi:** bayiden iade kesintide kuyruğa alınır, bağlantı gelince cari hesaba işlenir. İadenin GERÇEK zamanı gönderilir (`occurredAt`) — kuyrukta bekleyen kayıt sync anına yazılsa cari hesap yanlış güne düşerdi; istemci saati gelecekse ya da 7 günden eskiyse sunucu saatine düşülür. **Offline'da çalışmayan koruma:** "bu ürün bu bayiye son 7 günde gönderilmiş mi" kontrolü sunucudan geliyor, kesintide yapılamıyor — ekran bunu açıkça yazar ("gönderi geçmişi kontrolü yapılamadı"), sessizce "hiç gönderilmemiş" demez. **Kesintide yeni bölge de açılabiliyor:** istemci oturum numarası uydurmuyor — parti `regionId` ile gidiyor, oturumu sunucu çözüyor (açık varsa o, yoksa yeni). Kuyrukta bağımlılık grafiği gerekmiyor, düz FIFO korunuyor. İki cihaz aynı bölgeyi offline açsa bile tek oturuma düşer; veritabanındaki partial unique index (`regionId WHERE status='ACTIVE'`) yarışı kapatıyor. Oturumun gerçek açılış anı `openedAt`'te taşınır. Mal kabul ekranı açılırken **tüm bölgelerin** üreticileri önden indirilir, yoksa kesintide hiç girilmemiş bölgede liste boş kalırdı. **Kalan sınır:** çıkış (irsaliye) offline çalışmaz; offline açılan bölge, kayıtlar gönderilmeden "Bölge Bitti" ile kapatılamaz; iOS'ta arka plan senkronu olmadığı için kuyruk yalnızca uygulama ön plandayken ilerler. Ayrıntı: [`frontend/src/lib/syncQueue.js`](frontend/src/lib/syncQueue.js)
- 📡 **Bağlantı izleme** — Ağ hatasında 3 kez üstel beklemeli retry; kesinti sürerse ekranın üstünde kalıcı şerit + 5 sn sonra bir kez uyarı penceresi. Kesinti süreleri `localStorage`'a yazılır (`hal_outages`). Mal kabul formu `sessionStorage`'da taslak tutar
- 🔐 **Çıkış ekranı kilidi** — Bir pazarın çıkış ekranını aynı anda tek kişi açar (`ExitLock`, pazar başına tek satır). İkinci kişide ekran **salt okunur** gelir ve kimin çalıştığını yazar; aynı malı iki kişinin irsaliye etmesi ekran açılışında engellenir, POST anında değil. Açık ekran 30 sn'de bir yeniler, **2 dakika** sessiz kalan kilit devralınabilir (iPad kilitlenir/pil biterse pazar kilitli kalmasın). `ADMIN` kilit tanımaz, devralır. Kilit `createExit` içinde de doğrulanır — doğrudan API çağrısı kilidi atlayamaz
- 📱 **Mobile-first responsive** — Tablolar mobilde otomatik gizleme/yığma
- 🔐 **JWT auth + role guard** — Frontend `ProtectedRoute` + backend middleware
- ⚡ **Performans optimize** — Vendor chunk split, PDF/XLSX lazy, auto-refresh `document.hidden` pause
- 📄 **Pagination** — `/admin/takip` (irsaliye + mal kabul geçmişi) sayfa bazlı (50/page)
- 🔎 **Bölge + üretici filtresi** — `/admin/takip?tab=girisler` ekranında bölge seçilince üretici listesi o bölgeye daralır (`allRegions` üreticiler her bölgede kalır). Filtre backend'de bölgeden bağımsız uygulanır — üreticinin kayıtları başka bölge oturumunda da durabiliyor
- 🍅 **Ürün emoji ikonları** — Her ürüne admin panelinden emoji atanabilir (🍅 Domates, 🍎 Elma…)
- 🔥 **Akıllı ürün sıralaması** — Mal kabul ekranındaki ürünler en çok girişi yapılana göre sıralanır (global)
- 🔄 **Üretici aktif/pasif** — Admin panelinde tek tıkla toggle; pasif üreticiler operatör ekranında görünmez, backend de blok eder (cari kayıtlar korunur)
- 🗂️ **Ana ürün gruplaması** — Ürünlere admin panelinden "Ana ürün" (`Product.groupName`) atanır; mal kabul ekranında ana ürün (Portakal) → tıkla → çeşitler (Kan, Şeker, Valensia…) açılır. Admin ürün listesi de gruplu gösterilir
- 🛡️ **Denetim kaydı (audit log)** — Okuma/export **ve yazma** eylemlerini kaydeder: `CREATE`/`UPDATE`/`DELETE` (mal kabul, irsaliye, iade, transfer, kasa, cari, fiyat) + `LOGIN`/`LOGIN_FAIL`. `recordId` neyin, `detail` ne olduğunu tutar ("Acur · Pazar #14 · 4 kasa · 44 kg") — kayıt silinmiş olabileceği için özet logun kendisinde durur, JOIN ile geri getirilemez. Başarısız giriş denemeleri de yazılır (parola asla). **Saklama: 30 gün**, `server.js` günde bir temizler. Görüntüleyici: `/admin/erisim-kayitlari`, eylem türüne göre filtreli
  > 2026-08-18 öncesi yalnızca okuma/export loglanıyordu; bu yüzden kayıtlarda sadece admin panelini gezen kullanıcılar görünüyor, sahada mal kabul yapan operatörlerin izi bulunmuyordu
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
| **ACCOUNTING** | Admin paneli (raporlar + fiyat + finans + cari + iade kayıtları) |
| **CASE_MANAGER** | Kasa yönetimi paneli (bayi iadesi + bölgeye kasa verme, bakiyeler) |

> Bir kullanıcı **birden fazla role** sahip olabilir (`UserRole[]`). Tek rolü olan kullanıcı `/giris` sonrası otomatik ilgili panele yönlendirilir.

---

## 🔄 Temel İş Akışları

### Mal Kabul Akışı

> **Saha düzeni (2026-08-18):** kart alan sırası **Kasa → Pazar No → Miktar**. Adım değiştiğinde sayfa başa sarılır (alttaki "Son Girişler" listesi uzayınca form ekrandan kaçıyordu). Siyah kasa ve B kalite hem parti geneli hem **kart bazında** işaretlenebilir.
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

> **Fiş düzeni (2026-08-18):** kalemlerin soluna **sıra no** sütunu eklendi; numara **her sayfada 01'den** başlar (sayfa başına `PAGE_ROWS = 21` satır). Fişteki **"Toplam Borç" kaldırıldı**, "Toplam Kasa Bakiyesi" duruyor. Ekran çıktısı ([`IrsaliyePrint.jsx`](frontend/src/components/IrsaliyePrint.jsx)) ile PDF ([`pdfGenerator.js`](frontend/src/utils/pdfGenerator.js)) **kilit adımlı** — biri değişirse diğeri de değişmeli.
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
        │   (parti seçildiyse FIFO yalnız o Entry'lerin içinde çalışır)
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

- Tartı, kayıtlı kilodan **fazla olabilir** (13 Ağu 2026 kararı). Eskiden kesin
  reddediliyordu ve sahada işi tıkıyordu: mal kabulde kilo eksik girilmiş oluyor,
  tartı 450 diyor ama depo kaydı 423.86 gösteriyor, sevkiyat hiç yapılamıyordu.
  Stok açısından güvenli — depoda **kalan** kısım operatörün yazdığı tartıdan
  değil, kayıtlı oransal paydan hesaplanıyor, yani kalan asla eksiye düşmüyor.
  Tek koruma yazım hatasına karşı: kayıtlı kilonun 3 katını (veya +100 kg'ı)
  aşan değer 400 ile döner — 450 yerine 4500 yazılması faturaya gitmesin diye.
- Aradaki fark `Transfer.note`'a yazılır: eksikse `Tartı farkı: -X kg` (fire),
  fazlaysa `Tartı fazlası: +X kg`. İkisi de yazılır, yoksa fark sessizce kaybolur.
- Kısmî tüketilen Entry depoda kendi oransal payını korur, fark giden mala yazılır.
- **Parti seçimi** (`entryIds`, opsiyonel): grup satırındaki Transfer tüm partileri
  FIFO ile tarar; satır genişletilip **"Bu partiden"** denirse havuz o girişe iner.
  Aynı gruptan iki parti dururken (açılış sayımı + aynı gün gelen yeni mal) FIFO
  eskisini yiyor, depocu "yeni malı gönderdim" sanıyordu — fiziksel miktar doğru
  çıkıyor ama depoda kalan malın kimliği yanlış oluyordu. Seçilen id başka bir
  gruba (zayıf/siyah/birim) aitse eşleşmez ve reddedilir.
- Kilo alanı **otomatik dolmaz** (13 Ağu 2026 kararı). Eskiden kasa yazılınca depo
  ortalamasından ön-doldurulurdu; depocu tartıya bakmadan gönderiyor, tahmini
  değer gerçekmiş gibi kaydediliyordu. Kilo her zaman elle giriliyor, o satır için
  backend'in izin verdiği tavan input'un altında yazıyor.

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
| `/api/admin/depo/history` | Depo hareket geçmişi (`ADMIN`+`ACCOUNTING`) — `Entry` + `Transfer` birleşik, yön/tarih/arama filtreli, sayfalı |
| `/api/admin/returns` | İade **listeleme + silme** (`ADMIN`+`ACCOUNTING`). Saha `/api/depo/returns` yalnız `DEPO`+`ADMIN` — muhasebeci oradan 403 alıyordu. İade **oluşturma** burada yok: fiziksel mal kabulü, sahada tartılarak girilir |
| `/api/admin/purchase-prices/*` | **Alış** fiyatı (genel + üretici özel). Yalnız `ADMIN`/`ACCOUNTING` — saha karşılığı **yok** |
| `/api/admin/producer-payments/*` | Üretici bakiye/özet, hesap ekstresi, mal kabul dökümü, tek + toplu ödeme, fiyatsız liste, yeniden hesaplama |
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
| `/admin/fiyatlar` | ADMIN, ACC. | Günlük fiyat girişi — 3 sekme: satış (normal + net/indirimli) · alış · üretici özel fiyatı (+ marj kolonu) |
| `/admin/finans` | ADMIN, ACC. | Bayi alacak / Üretici borç cari — **ham defter** (elle düzeltme, açılış devri) |
| `/admin/uretici-odeme` | ADMIN, ACC. | Üretici ödeme paneli (bakiye, ekstre, mal kabul dökümü, tek/toplu ödeme, makbuz) |
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
- **Producer** — Üretici (bölgeye opsiyonel bağlı; `allRegions=true` ise her bölgenin listesinde görünür). `pricePremiumPct` → genel **alış** fiyatına uygulanan yüzde prim/iskonto (+5 = %5 fazla öde, −3 = %3 eksik). Ürün bazlı özel fiyat varsa **uygulanmaz**
- **RegionSession** — Bir bölgenin gün içi mal kabul oturumu (`ACTIVE`/`COMPLETED`)
- **Product / Quality** — Ürün ve kalite katalog (`Product.groupName` → ana ürün gruplaması, nullable). `Product.unit: ProductUnit` (`CASE`/`BUNCH`/`PIECE`) → satış birimi (kilo / bağ / adet). **Quality kullanımdan kalktı** (2026-08-13): mal kabul zaten kalite göndermiyordu, fiyat ürün başına tek. Tablo ve `Entry.qualityId`/`ReturnRecord.qualityId` alanları geçmiş kayıtlar için duruyor
- **Market** — Pazar/bayi (`no` unique numara)
- **Entry** — Mal kabul kaydı (Product + Producer + Quality + Market + kasa/miktar). `purchasePricePerKg` / `purchasePriceSource` / `purchaseQty` → mal kabul anındaki **alış snapshot'ı**; borç bunlardan hesaplanır, `weight`'ten değil (transferde yeniden tartılıp değişebiliyor). Bu üç kolon **ticari sır**, saha yanıtlarından `middleware/purchaseGuard.js` ile silinir. `source: EntrySource` (`HARVEST`/`RETURN`/`DISCARD`) — raporlar yalnızca `HARVEST` sayar. `unit` birim snapshot'ı, `disposableCase` tek kullanımlık kasa işareti, `bQuality` ikinci kalite işareti (**yalnızca etiket** — kasa hesabına ve fiyata karışmaz). `disposableCase` ve `bQuality` satır bazında ayarlanabilir: mal kabulde üstteki tik partinin tamamına uygulanır, kart üzerindeki işaret tek satırı ayrıştırır
- **Exit / ExitItem** — İrsaliye + içerdiği Entry'ler (fiyat snapshot)
- **Transfer** — Pazardan pazara taşıma geçmişi
- **PurchasePrice** — Günlük **alış** fiyatı (üreticiye ödenen). `Price`'ın eşi ve ondan tamamen bağımsız; kalite kolonu **yok** (bilinçli — `Price`'taki nullable-unique tuzağı tekrarlanmasın diye, bu yüzden `@@unique(productId, date)` gerçek unique ve `prisma.upsert` çalışıyor). Carry-forward aynı: fiyat değiştirilene kadar geçerli
- **ProducerPrice** — Üretici + ürün + gün özel alış fiyatı; katmanların en üstü, varsa prim uygulanmaz. `cancelled` → özel fiyatı kaldırmanın **tek doğru yolu**: satır silinseydi carry-forward bir önceki fiyatı diriltir ve "kaldırdım" denen rakam geri gelirdi
- **Price** — Günlük **satış** fiyatı. `pricePerKg` = UYGULANACAK tutar (indirim varsa indirimli), `listPricePerKg` = normal/indirim öncesi fiyat, null ise indirim yok. DB'de CHECK constraint `listPricePerKg >= pricePerKg` zorluyor. `qualityId` **nullable**: NULL = ürünün genel fiyatı (yeni standart, kalite kullanımdan kalktı), dolu = eski kaliteli satır. Arama iki katmanlı — önce ürün+kalite, yoksa genel: **tek karar noktası [`backend/src/utils/prices.js`](backend/src/utils/prices.js) → `priceOf()`**. Genel fiyatın tekilliğini partial unique index sağlar; `@@unique` NULL'lu satırları kapsamaz (Postgres'te iki NULL eşit sayılmaz)
- **LedgerEntry** — Bayi/üretici cari hesap kaydı (`MARKET_INVOICE`, `PAYMENT`, `ADJUSTMENT`, …). `entryId` **unique + cascade** → `PRODUCER_DEBT`'i doğduğu mal kabule bağlar (`exitId`'nin üretici tarafındaki aynası): bir giriş en fazla bir borç doğurur (offline retry'a karşı ikinci savunma hattı), giriş silinince borç da düşer, ve dolu `entryId` "bu kayıt otomatik" demek — elle silinemez. `paymentMethod` (`CASH`/`TRANSFER`/`CHECK`) yalnız `*_PAYMENT` tiplerinde dolar, DB'de CHECK constraint zorluyor. Bakiye kolonu **yok**, `signFor()` + `groupBy` ile hesaplanır
- **CaseMovement** — Boş kasa hareketi. Bayi tarafı (`MARKET_OUT/IN/INIT/ADJUST`, `marketId`) ve bölge tarafı (`REGION_OUT/IN/ADJUST`, `regionId`). `REGION_IN` mal kabulle otomatik doğar, `entryId` ile girişe bağlıdır (unique + cascade). **Hangi kaydın kasa hesabına gireceğine tek yer karar verir: [`backend/src/utils/cases.js`](backend/src/utils/cases.js) → `trackedCases()`** — yalnızca siyah/karton kasa 0 döner; birim karışmaz (2026-08-13'te değişti, önce `BUNCH` da 0 dönüyordu)
- **ReturnRecord** — Bayiden iade (atomic Entry + Ledger + CaseMovement bağlar)
- **User** — Sistem kullanıcısı + `roles: UserRole[]`
- **AuditLog** — Erişim/export **ve yazma** kaydı (`action`, `resource`, `recordCount`, `recordId`, `detail`, `ip`, `userAgent`). `username` denormalize: hesap silinse de iz kalır. 30 günden eski kayıtlar otomatik silinir
- **SyncedBatch** — Offline kuyruğun idempotency kaydı. `clientId` **PRIMARY KEY**: transaction'ın ilk adımı bu satırı yazmak, ikinci istek PK ihlaline çarpıp geri dönüyor. Entry'ye `@unique` kolon konamazdı — bir batch N satır yazar, hepsi aynı anahtarı taşır
- **ExitLock** — Çıkış ekranı kilidi. `marketId` **PRIMARY KEY** (pazar başına tek satır), `heartbeatAt` ile 2 dakikalık zaman aşımı. Tek karar noktası: [`backend/src/utils/exitLock.js`](backend/src/utils/exitLock.js)

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

### Canlıya geçiş sıfırlaması (tek seferlik)

Deneme sürecinde birikmiş veriyi temizler; ürün, pazar, üretici, bölge, kullanıcı
ve kalite tanımlarına dokunmaz. Hareket verisi + fiyatlar silinir, ID sayaçları
1'e döner — **irsaliye numarası #1'den başlar.**

```bash
node scripts/reset-for-production.js                              # kuru çalışma
RESET_CONFIRM=SIFIRLA node scripts/reset-for-production.js --yes  # uygular
```

Çift kilit bilinçli: script her deploy'da canlıya gidiyor, `--yes` tek başına
geçmişten yanlışlıkla çağrılabilecek kadar kolay. **Öncesinde `pg_dump` şart** —
`TRUNCATE` geri alınamaz, tek dönüş yolu yedektir.

Sıfırlama devir bırakmaz. Depoda duran mal ve şoförlerin üzerindeki boş kasa
fiziksel gerçek olduğu için ayrıca açılış kaydı olarak girilir:

```bash
node scripts/import-sayim-20260822.js         # kuru çalışma
node scripts/import-sayim-20260822.js --yes   # uygular
```

Idempotent — yazılmış kalemi ürün+kasa+miktar eşleşmesiyle tanıyıp atlar, sayım
sonradan düzeltilirse aynı script yeniden çalıştırılabilir. Mal `DEPO` pazarına
oturumsuz girer (`createdBy` = sayım tarihi), boş kasa bölgelere `REGION_OUT`
olarak yazılır.

> Sayım listesi Excel'den geliyorsa ürün adları elle yazıldığı için birebir
> tutmayabilir. Eşleştirmede `toLocaleUpperCase('tr-TR')` kullanılmalı: düz
> `toUpperCase()` Türkçe İ/ı'yı bozar ve "SARIMSAK" ile "Sarmısak" eşleşmez.

---

## 🧪 Manuel Test Checklist

### İndirimli Satış
- [ ] Satış sekmesinde normal 70 / net 50 gir → listede "%29 indirim" rozeti çıktı
- [ ] O üründen irsaliye kes → bayi borcu **net** fiyattan hesaplandı (normal fiyat faturayı şişirmedi)
- [ ] Teslim fişinde (ekran + PDF) o kalem **"70 → 50"**, indirimsiz kalem tek rakam
- [ ] Normal fiyatı boşalt → indirim kalktı, fişte tek rakam
- [ ] Normal (50) < net (70) gir → hata mesajı çıktı, kaydedilmedi
- [ ] Fiyatı değiştir → eski irsaliye fişi hâlâ eski indirimi gösteriyor

### Üretici Ödeme / Alış Fiyatı
- [ ] `/admin/fiyatlar` → Alış sekmesinde fiyat gir → mal kabul yap → üreticinin bakiyesi doğru arttı
- [ ] Fiyatsız ürünle mal kabul → **borç yazılmadı** ve "Fiyatsız Mal Kabul" sekmesinde göründü
- [ ] Prim `%5` üreticide borç genel fiyatın %5 üstü, dökümde rozet `+%5 prim`
- [ ] Aynı üreticiye ürün bazlı **özel fiyat** tanımla → borç özel fiyattan, rozet `Özel fiyat`, **prim uygulanmadı**
- [ ] Özel fiyatı temizle (✕) → ertesi gün prim katmanına düştü, eski özel fiyat geri gelmedi
- [ ] `99 ATILAN`'a mal kabul → **borç yazıldı** (fire de ödenir)
- [ ] Bayiden iade al → üretici bakiyesi **değişmedi** (çift borç yok)
- [ ] Depo transferinde kiloyu değiştir → borç **değişmedi**, dökümde fire farkı göründü
- [ ] Mal kabul kilosunu düzelt → borç senkronlandı; girişi sil → borç da silindi
- [ ] `/admin/finans` üretici sekmesinden otomatik borcu silmeye çalış → **400** hatası
- [ ] Tek ödeme + makbuz: A4'te iki nüsha, ödeme öncesi/sonrası bakiye doğru, tutarlar "TL" (₺ değil)
- [ ] Toplu ödeme: "Bakiyeleri Kapat" → seçilenlerin bakiyesi sıfırlandı; bir satıra hatalı tutar gir → **hiçbiri** yazılmadı
- [ ] Aynı toplu ödemeyi iki kez gönder (çift tıkla) → ikinci kez para yazılmadı
- [ ] `OPERATOR` token'ıyla `/api/markets/:id/entries` ve `POST /api/entry/batch` yanıtlarında `purchasePricePerKg` **YOK**
- [ ] `node scripts/check-producer-debt.js` → TEMİZ


### Depo Geçmişi
- [ ] Sahadan depoya mal kabul → Geçmiş sekmesinde **GİRİŞ** olarak göründü, kaydı yapan kullanıcı yazıyor
- [ ] Depodan pazara transfer → **ÇIKIŞ** satırı çıktı, hedef pazar doğru
- [ ] Aynı gün girip aynı gün çıkan mal → **iki satır** da var (stok sekmesinde hiç görünmüyor)
- [ ] Kısmî transfer (split) → giriş satırı mal kabuldeki **tam kasa adedini** gösteriyor, bölünmüş rakamı değil
- [ ] Bayiden iade → GİRİŞ satırı; imha → ÇIKIŞ satırı
- [ ] Tarih aralığı boş bırakılınca **bugün** geliyor; yön filtresi ve arama çalışıyor
- [ ] Export alındığında `AuditLog`'a `EXPORT` kaydı düştü (`depo-history`)

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
