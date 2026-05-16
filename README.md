# Hal Yönetim Sistemi

Sebze-meyve hali için sürücü bazlı mal kabul, market bazlı irsaliye ve admin yönetim paneli.

## Kurulum

### Gereksinimler
- Node.js 20+
- PostgreSQL 14+

### 1. Backend

```bash
cd backend
cp .env.example .env
# .env dosyasındaki DATABASE_URL'yi düzenle
npm install
npm run db:push      # Prisma schema'yı DB'ye uygula
npm run db:seed      # Test verisi ekle (şoförler, ürünler, pazarlar)
npm run dev          # http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
```

Frontend, `/api/*` isteklerini otomatik olarak `localhost:3001`'e yönlendirir.

---

## Sayfalar

| URL | Açıklama |
|-----|----------|
| `/` | Mal Kabul — sürücü/ürün/kalite seçimi + giriş formu |
| `/cikis` | Çıkış — pazar listesi |
| `/cikis/:id` | İrsaliye — checkbox listesi + PDF |
| `/admin/giris` | Admin girişi |
| `/admin` | Dashboard |
| `/admin/soforler` | Şoför CRUD |
| `/admin/urunler` | Ürün CRUD |
| `/admin/pazarlar` | Pazar CRUD |
| `/admin/kaliteler` | Kalite CRUD |
| `/admin/raporlar` | Günlük/pazar/ürün raporları |

---

## Ortam Değişkenleri (.env)

```
DATABASE_URL="postgresql://USER:PASS@localhost:5432/hal_yonetim"
JWT_SECRET="gizli-anahtar-degistir"
JWT_EXPIRES_IN="8h"
PORT=3001
ADMIN_INITIAL_PASSWORD="admin123"
```

**Üretimde `JWT_SECRET` ve `ADMIN_INITIAL_PASSWORD` mutlaka değiştirilmeli.**

---

## API Testleri

`backend/tests/api.http` dosyasını VS Code REST Client veya JetBrains HTTP Client ile aç.

---

## Manuel Test Checklist

### Giriş Paneli
- [ ] Şoför seçimi → araç oturumu başlar
- [ ] Ürün seçimi → kalite adımına geçer
- [ ] Kalite seçimi → form açılır
- [ ] Geçerli form → kayıt + ürün listesine dön
- [ ] Eksik alan → Türkçe hata mesajı
- [ ] "Araç Tamamlandı" → onay → şoför listesine dön

### Çıkış Paneli
- [ ] Pazarlar bekleyen sayısıyla listelenir
- [ ] Pazar seçimi → girişler listelenir
- [ ] Checkbox seçimi → özet güncellenir
- [ ] İrsaliye Oluştur → PDF indirilir
- [ ] Oluşturulan girişler artık listede görünmez

### Admin Paneli
- [ ] Yanlış şifre → "Şifre hatalı"
- [ ] Doğru şifre → dashboard'a yönlendirilir
- [ ] Şoför/ürün/pazar/kalite CRUD çalışır
- [ ] Sayfa yenilemede oturum korunur
- [ ] Çıkış Yap → giriş sayfasına döner
- [ ] Raporlar tarih filtresiyle çalışır

---

## Klasör Yapısı

```
hal-yonetim/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.js
│   ├── src/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── utils/
│   └── tests/api.http
└── frontend/
    └── src/
        ├── components/ui/
        ├── pages/{Entry,Exit,Admin}/
        ├── store/
        ├── services/
        └── utils/
```
