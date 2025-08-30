# TCP/UDP Router

## Proje Hakkında

Bu proje, TCP ve UDP protokolleri üzerinden gelen ağ trafiğini yönlendiren, izleyen ve ölçümleyen bir router uygulamasıdır. Performans ve güvenilirlik odaklı olarak geliştirilmiştir. Prometheus uyumlu metrik toplama ve HTTP tabanlı sağlık kontrolleri gibi özellikler içerir.

---

## Kurulum ve Çalıştırma

### Gereksinimler

- Node.js (v16 veya üzeri)
- npm
- TypeScript

### Kurulum

```bash
npm install
```

### Çalıştırma

```bash
npm run dev
```

---

## Yapılandırma

Yapılandırma ayarları `.env` dosyası veya ortam değişkenleri ile sağlanabilir.

| Değişken            | Açıklama                          | Varsayılan Değer |
|---------------------|---------------------------------|------------------|
| PORT                | HTTP sunucu portu                | 3000             |
| TCP_PORT            | TCP sunucu portu                 | 4000             |
| UDP_PORT            | UDP sunucu portu                 | 5000             |
| LOG_LEVEL           | Log seviyesi (error, warn, info, debug) | info       |
| METRICS_ENABLED     | Metrik toplama aktif mi? (true/false) | true          |
| METRICS_PORT        | Metrik sunucu portu              | 3001             |
| PLUGIN_DIR          | Eklenti dizini                   | ./plugins        |
| MAX_CONNECTIONS     | Maksimum bağlantı sayısı         | 1000             |
| CONNECTION_TIMEOUT  | Bağlantı zaman aşımı (ms)        | 30000            |
| HEALTH_CHECK_INTERVAL | Sağlık kontrol aralığı (ms)    | 30000            |
| ENABLE_HTTP_HEALTH  | HTTP sağlık sunucusu aktif mi?   | true             |
| HTTP_HEALTH_PORT    | HTTP sağlık sunucu portu         | 8080             |

---

## Mimari

- **Container:** Bağımlılık enjeksiyonu için servis kayıt ve çözümleme sistemi.
- **Metrics:** Prometheus uyumlu metrik toplama ve HTTP endpoint.
- **Monitoring:** Sağlık kontrolleri ve sistem durumu izleme.
- **Plugin System:** Dinamik eklenti yükleme ve yönetimi.
- **TCP/UDP Server:** Ağ trafiğini dinleyen ve yönlendiren sunucular.

---

## Hata Çözümü

### "Service not found: metrics" Hatası

Bu hata, monitoring sistemi başlatılırken "metrics" servisi container'da kayıtlı olmadığında ortaya çıkar. Çözüm için:

- `setupMetrics` fonksiyonu her zaman çağrılır ve "metrics" servisi container'a kayıt edilir.
- Metrik sunucusu sadece `METRICS_ENABLED` true ise başlatılır.
- `src/index.ts` dosyasında `setupMetrics` çağrısı koşulsuz yapılır.

---

## Geliştirme

- Kod TypeScript ile yazılmıştır.
- Bağımlılıklar container üzerinden yönetilir.
- Yeni eklentiler `plugins` dizinine eklenebilir.

---

## Lisans

[MIT Lisansı](https://github.com/wkerwmm/tcp-udp-router/blob/main/LICENSE)

---

## İletişim

Herhangi bir sorun veya öneri için lütfen proje sahibine ulaşın.
