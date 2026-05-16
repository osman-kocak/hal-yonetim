# Hal Yönetim Sistemi

> Sebze-meyve hali için **full-stack** stok, satış, cari hesap ve kasa takip sistemi.

Şoför bazlı mal kabulden başlayıp; depo yönetimi, pazar bazlı irsaliye kesimi, fiyat takibi, cari hesap (bayi/üretici) ve boş kasa hareketlerine kadar tüm operasyonu tek panelde birleştiren çok rollü bir web uygulaması.

---

## 🚀 Özellikler

- 🚚 **Mal kabul akışı** — Şoför → Üretici → Ürün → Kalite → Kasa/Kilo girişi (adım adım onboarding)
- 📦 **Depo yönetimi** — Ürün bazlı toplu transfer (FIFO mantığı + parçalı kasa ayırma/split)
- 📋 **Çıkış & İrsaliye** — PDF üretimi, fiyat snapshot (irsaliye sonradan fiyat değişse de sabit kalır)
- 🔄 **İade kabul** — Depoya geri al **veya** "atılan" olarak işaretle (atomic: Entry + Ledger + CaseMovement)
- 💰 **Çoklu rol kullanıcı sistemi** — `ADMIN`, `DEPO`, `OPERATOR`, `ACCOUNTING`, `CASE_MANAGER`
- 🧺 **Boş kasa takibi** — Otomatik `DRIVER_IN`/`MARKET_OUT` + manuel düzeltme hareketleri
- 📊 **Cari hesap** — Bayi alacak (irsaliye), üretici borç (manuel + ödeme)
- 📈 **Raporlar** — Günlük, pazar bazlı, ürün bazlı, top products
- 📥 **PDF + XLSX export** — Tüm liste sayfalarında (jsPDF + SheetJS)
- 📱 **Mobile-first responsive** — Tablolar mobilde otomatik gizleme/yığma
- 🔐 **JWT auth + role guard** — Frontend `ProtectedRoute` + backend middleware

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

### PDF / Excel
- **jsPDF 4** + **jspdf-autotable 5** — Arial TTF font ile Türkçe karakter desteği
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
npm run db:seed            # Test verisi (şoför, ürün, pazar, ilk admin)
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
```

> ⚠️ **Üretimde** `JWT_SECRET` ve `ADMIN_INITIAL_PASSWORD` **mutlaka** değiştirilmeli.

---

## 👥 Roller ve Yetkiler

| Rol | Erişim Alanı |
|------|--------------|
| **ADMIN** | Tüm paneller (mal kabul, depo, çıkış, kasacı, admin) |
| **OPERATOR** | Mal kabul + çıkış (irsaliye) |
| **DEPO** | Depo transfer + iade kabul |
| **ACCOUNTING** | Admin paneli (raporlar + fiyat + finans + cari) |
| **CASE_MANAGER** | Kasa yönetimi paneli (boş kasa hareketleri) |

> Bir kullanıcı **birden fazla role** sahip olabilir (`UserRole[]`). Tek rolü olan kullanıcı `/giris` sonrası otomatik ilgili panele yönlendirilir.

---

## 🔄 Temel İş Akışları

### Mal Kabul Akışı
```
DriverSelect → ProducerSelect → ProductSelect → QualitySelect → EntryForm
                                                                    │
                                                                    ▼
                                  Entry kaydı + (otomatik) CaseMovement.DRIVER_IN
```

### İrsaliye / Çıkış Akışı
```
ExitPage (pazar listesi, bekleyen entry sayıları)
        │
        ▼
MarketExitDetail (entry checkbox listesi + fiyat özeti)
        │
        ▼
"İrsaliye Oluştur" → PDF üretilir
        │
        ▼
Otomatik: Exit + ExitItem + CaseMovement.MARKET_OUT + LedgerEntry.MARKET_INVOICE
(fiyat snapshot ExitItem.pricePerKg'ye yazılır)
```

### İade Akışı
```
Bayiden iade → ReturnsPage form
        │
        ▼
Tek transaction'da:
  • Entry (depoya geri / opsiyonel)
  • LedgerEntry.MARKET_ADJUSTMENT (alacak düşümü)
  • CaseMovement.MARKET_IN (boş kasa iadesi)
"Atılan" işaretliyse → Entry oluşturulmaz, sadece ledger düşümü
```

### Transfer (Depo)
```
DepoTransferPage → Pazar seç (kaynak) → Ürün seç → Hedef pazar seç → Adet/kilo
        │
        ▼
FIFO: en eski Entry'lerden başlanır, gerekirse split yapılır
        │
        ▼
Transfer kaydı + ilgili Entry'lerin marketId güncellenir
```

---

## 🛣️ API Endpoint Özeti

| Prefix | Sorumluluk |
|--------|------------|
| `/api/auth/*` | Login + token refresh |
| `/api/entry/*` | Mal kabul (Entry CRUD + driver session) |
| `/api/exit/*` | İrsaliye listesi + oluşturma + PDF data |
| `/api/depo/*` | Pazar arası transfer (FIFO + split) |
| `/api/cases/*` | CaseMovement CRUD (bayi + şoför) |
| `/api/vehicle/*` | VehicleSession (aktif/tamamlanan) |
| `/api/markets/*` | Pazar listesi (public dahil) |
| `/api/admin/*` | Driver/Producer/Product/Quality/User CRUD + raporlar + finans + iade |
| `/api/public/*` | Auth gerektirmeyen listeler (şoför, ürün) |

> Tüm yazma uçları `requireAuth` + rol middleware. Detay için `backend/src/routes/`.

---

## 📂 Sayfa Yapısı (Frontend Routes)

| URL | Rol | Açıklama |
|-----|-----|----------|
| `/giris` | public | Tek giriş sayfası (eski `/admin/giris`, `/depo/giris` buraya redirect) |
| `/` | auth | Rol seçimi (tek rolde otomatik yönlendir) |
| `/mal-kabul` | OPERATOR, ADMIN | 5 adımlı mal kabul wizard |
| `/cikis` | any auth | Pazar bazlı çıkış listesi |
| `/cikis/:marketId` | any auth | İrsaliye kesim ekranı + PDF |
| `/depo` | DEPO, ADMIN | Toplu transfer |
| `/kasaci` | CASE_MANAGER, ADMIN | Kasa hareketleri |
| `/admin` | ADMIN, ACCOUNTING | Dashboard |
| `/admin/fiyatlar` | ADMIN, ACC. | Günlük ürün×kalite fiyat girişi |
| `/admin/finans` | ADMIN, ACC. | Bayi alacak / Üretici borç cari |
| `/admin/takip` | ADMIN, ACC. | Geçmiş hareket logu |
| `/admin/kasalar` | ADMIN, ACC. | Kasa hareketleri raporu |
| `/admin/transferler` | ADMIN, ACC. | Transfer geçmişi |
| `/admin/iadeler` | ADMIN, ACC. | İade kayıtları |
| `/admin/kullanicilar` | ADMIN | Kullanıcı CRUD + rol atama |
| `/admin/soforler` | ADMIN, ACC. | Şoför CRUD |
| `/admin/ureticiler` | ADMIN, ACC. | Üretici CRUD (şoföre bağlı) |
| `/admin/urunler` | ADMIN, ACC. | Ürün CRUD |
| `/admin/pazarlar` | ADMIN, ACC. | Pazar/Bayi CRUD |
| `/admin/kaliteler` | ADMIN, ACC. | Kalite CRUD |
| `/admin/raporlar` | ADMIN, ACC. | Günlük/pazar/ürün/top products |

---

## 🗄️ Domain Modeli (Prisma)

Ana entity'ler:

- **Driver** — Şoför (üreticilere ve araç oturumlarına bağlı)
- **Producer** — Üretici (şoföre opsiyonel bağlı)
- **VehicleSession** — Bir şoförün gün içi araç oturumu (`ACTIVE`/`COMPLETED`)
- **Product / Quality** — Ürün ve kalite katalog
- **Market** — Pazar/bayi (`no` unique numara)
- **Entry** — Mal kabul kaydı (Product + Producer + Quality + Market + kasa/kilo)
- **Exit / ExitItem** — İrsaliye + içerdiği Entry'ler (fiyat snapshot)
- **Transfer** — Pazardan pazara taşıma geçmişi
- **Price** — Günlük (product, quality, date) fiyatları — `@@unique`
- **LedgerEntry** — Bayi/üretici cari hesap kaydı (`MARKET_INVOICE`, `PAYMENT`, `ADJUSTMENT`, …)
- **CaseMovement** — Boş kasa hareketi (`MARKET_OUT/IN/INIT/ADJUST`, `DRIVER_OUT/IN/INIT/ADJUST`)
- **ReturnRecord** — Bayiden iade (atomic Entry + Ledger + CaseMovement bağlar)
- **User** — Sistem kullanıcısı + `roles: UserRole[]`

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

---

## 🧪 Manuel Test Checklist

### Mal Kabul
- [ ] Şoför seç → araç oturumu açılır
- [ ] Üretici → Ürün → Kalite → Form akışı kesintisiz
- [ ] Geçersiz kasa/kilo → Türkçe hata mesajı
- [ ] "Araç Tamamlandı" → onay → şoför listesine dön
- [ ] Otomatik `CaseMovement.DRIVER_IN` oluşur

### Çıkış / İrsaliye
- [ ] Pazarlar bekleyen entry sayısıyla listelenir
- [ ] Entry seçimi → özet (kasa, kilo, tutar) güncellenir
- [ ] PDF Türkçe karakter doğru (Arial TTF)
- [ ] İrsaliye sonrası Exit + ExitItem + Ledger + CaseMovement oluşur
- [ ] `pricePerKg` snapshot doğru kayıt edilir

### Admin
- [ ] Yanlış şifre → "Şifre hatalı"
- [ ] Sayfa yenilemede oturum korunur
- [ ] CRUD sayfaları (driver/producer/product/market/quality) ekleme/silme/güncelleme
- [ ] Raporlar tarih filtresiyle çalışır
- [ ] PDF + XLSX export çalışır

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
│   │   ├── routes/                # admin, depo, cases, entry, exit, vehicle, market, public, index
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

Özel kullanım — **MS Yazılım**.

## 📞 İletişim

- **MS Yazılım**
- Email: **bisiparisadm@gmail.com**
- Tel / WhatsApp: **+90 533 846 12 60**
