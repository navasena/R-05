/**
 * SERVICE WORKER (PWA) Portal NAVASENA - ENTERPRISE EDITION
 * Architecture: Apex Networking (Stale-While-Revalidate Hybrid, Single-Truth URL)
 * Protection: Opaque Quota Shield, Thread Lockdown GC, Fault-Tolerant Pre-Caching
 */

const APP_VERSION = '1.5'; // Versi final, akan memicu pemusnahan memori lama
const CACHE_PREFIX = 'portal-navasena-';
const CACHE_STATIC = CACHE_PREFIX + 'static-v' + APP_VERSION;
const CACHE_DYNAMIC = CACHE_PREFIX + 'dynamic-v' + APP_VERSION;

// THE SINGLE TRUTH STATIC ASSETS
// URL './' dihilangkan untuk membunuh bug Schizophrenic Index. Kita sentralisasi ke './index.html'
// Google Fonts dihilangkan dari pra-instalasi untuk mencegah Opaque CORS Block, akan diurus oleh Interseptor Jaringan
const staticAssets = [
  './index.html', 
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logo.png',
  'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
  './warrior.png',
  './elite.png',
  './master.png',
  './grandmaster.png',
  './epic.png',
  './legend.png',
  './mythic.png',
  './glory.png',
  './afk.png'
];

// =========================================================
// 1. MANAJEMEN MEMORI (GARBAGE COLLECTOR) DENGAN THREAD LOCKDOWN
// =========================================================
let isGCRunning = false;
const limitCacheSize = async (name, size) => {
  if (isGCRunning) return;
  isGCRunning = true;
  try {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    if (keys.length > size) {
      const keysToDelete = keys.slice(0, keys.length - size);
      await Promise.all(keysToDelete.map(key => cache.delete(key)));
    }
  } catch (err) {
    console.warn('[SW] Pembersihan Memori Gagal:', err);
  } finally {
    isGCRunning = false;
  }
};

// =========================================================
// 2. FASE INSTALASI (FAULT-TOLERANT PRE-CACHING)
// =========================================================
self.addEventListener('install', event => {
  self.skipWaiting(); // Paksa aktivasi seketika tanpa menunggu tab ditutup
  
  event.waitUntil(
    caches.open(CACHE_STATIC).then(async cache => {
      console.log('[SW] Memasang Pelindung Aset Statis NAVASENA...');
      
      // Menggunakan allSettled: Jika 1 gambar gagal (timeout), instalasi PWA TIDAK akan batal
      await Promise.allSettled(
        staticAssets.map(async asset => {
          // Hanya aset HTTP lokal yang diberi no-cache, aset CDN menggunakan CORS
          const reqOpt = asset.startsWith('http') ? { mode: 'cors' } : { cache: 'no-cache' };
          try {
            const response = await fetch(asset, reqOpt);
            // PROTEKSI OPAQUE: Jangan pernah cache file yang statusnya 0 / Opaque
            if (response.ok && response.type !== 'opaque') {
              await cache.put(asset, response);
            } else {
              console.warn('[SW] Aset Non-OK/Opaque dilewati:', asset);
            }
          } catch (err) {
            console.warn('[SW] Aset gagal ditarik (Timeout/Offline):', asset);
          }
        })
      );
    })
  );
});

// =========================================================
// 3. FASE AKTIVASI (PEMUSNAHAN KAPSUL WAKTU LAMA)
// =========================================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          // Hancurkan semua memori berawalan portal-navasena- yang BUKAN versi V 1.6 ini
          if (key.startsWith(CACHE_PREFIX) && key !== CACHE_STATIC && key !== CACHE_DYNAMIC) {
            console.log('[SW] Menghapus Cache Usang:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Transisi versi memori selesai. Kendali Penuh Aktif.');
      return self.clients.claim(); // Ambil kendali penuh atas semua tab yang terbuka saat ini juga
    })
  );
});

// =========================================================
// 4. INTERSEPTOR JARINGAN & FIREWALL KOGNITIF
// =========================================================
self.addEventListener('fetch', event => {
  const req = event.request;
  const reqUrl = new URL(req.url);

  // Filter 1: Hanya cegat metode GET dengan protokol HTTP/HTTPS
  if (req.method !== 'GET' || !reqUrl.protocol.startsWith('http') || reqUrl.pathname.endsWith('sw.js')) return;

  // Filter 2: Blacklist aset yang DILARANG MUTLAK di-cache (Excel/PDF Export, Analytics)
  const isBlacklisted = reqUrl.pathname.match(/\.(xlsx|xls|csv|pdf|zip)$/i) || reqUrl.hostname.includes('google-analytics');
  if (isBlacklisted) {
    event.respondWith(fetch(req).catch(() => Response.error()));
    return;
  }

  // STRATEGI 1: BYPASS GOOGLE CLOUD SYNC (Wajib Network-Only, Pantang Tersentuh Cache)
  if (reqUrl.hostname.includes('script.google.com') || reqUrl.hostname.includes('script.googleusercontent.com')) {
    return; 
  }

  // KANONIKALISASI HTML: Membunuh bug Double-Index dengan memusatkan URL '/' ke './index.html'
  let targetReq = req;
  if (req.mode === 'navigate' || reqUrl.pathname.endsWith('/')) {
    targetReq = new Request('./index.html');
  }

  const isHtmlRequest = targetReq.url.includes('index.html') || (req.headers.get('accept') && req.headers.get('accept').includes('text/html'));
  
  // STRATEGI 2: THE APEX HYBRID SWR (Stale-While-Revalidate untuk File Utama)
  // Tidak ada lagi Timeout 3 Detik yang membunuh koneksi desa.
  if (isHtmlRequest) {
    event.respondWith((async () => {
      const cachedRes = await caches.match(targetReq, { ignoreSearch: true });
      
      const fetchPromise = fetch(targetReq).then(async networkRes => {
        if (networkRes && networkRes.ok) {
          const cache = await caches.open(CACHE_STATIC);
          await cache.put(targetReq, networkRes.clone());
        }
        return networkRes;
      }).catch(() => null); // Jika offline, fetch gagal dengan tenang tanpa crash

      // Thread Lockdown: Paksa SW tetap hidup sampai Fetch Background selesai, meskipun Cache instan ditampilkan
      event.waitUntil(fetchPromise);

      // Berikan Cache secara instan. Jika tidak ada (Kunjungan Pertama / Dihapus manual), tunggu Fetch selesai.
      return cachedRes || fetchPromise.then(res => res || Response.error());
    })());
    return;
  }

  // STRATEGI 3: GOOGLE FONTS & EKSTERNAL ASSETS (Opaque Protection & Cache-First)
  if (reqUrl.hostname === 'fonts.googleapis.com' || reqUrl.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cachedRes = await caches.match(req);
      if (cachedRes) return cachedRes; // Balas instan dari memori

      try {
        const networkRes = await fetch(req);
        // PROTEKSI KUOTA MUTLAK: Haram hukumnya menyimpan Opaque Response (status 0). Cegah 7MB Quota Bomb!
        if (networkRes && networkRes.ok && networkRes.type !== 'opaque') {
          const clone = networkRes.clone();
          event.waitUntil((async () => {
            const cache = await caches.open(CACHE_STATIC);
            await cache.put(req, clone);
          })());
        }
        return networkRes;
      } catch (err) {
        return Response.error();
      }
    })());
    return;
  }

  // STRATEGI 4: STATIC & DYNAMIC ASSETS LAINNYA (Cache-First, Fallback Network)
  event.respondWith((async () => {
    // Abaikan parameter Search/Query string agar file seperti logo.png?v=1.5 tetap kena hit
    const cachedRes = await caches.match(req, { ignoreSearch: true });
    if (cachedRes) return cachedRes; // Anti-DDoS Sendiri: Respon langsung jika ada memori

    try {
      const networkRes = await fetch(req);
      // Validasi ketat keamanan Cache: OK dan BUKAN Opaque
      if (networkRes && networkRes.ok && networkRes.type !== 'opaque') {
        const clone = networkRes.clone();
        
        // THREAD LOCKDOWN (Mencegah Kematian Garbage Collector di tengah jalan)
        event.waitUntil((async () => {
          const isCoreAsset = staticAssets.some(a => reqUrl.href.includes(a.replace('./', '')));
          const cacheName = isCoreAsset ? CACHE_STATIC : CACHE_DYNAMIC;
          
          const cache = await caches.open(cacheName);
          await cache.put(req, clone);
          
          if (cacheName === CACHE_DYNAMIC) {
             await limitCacheSize(CACHE_DYNAMIC, 60); // Pembersihan sampah memori dengan aman
          }
        })());
      }
      return networkRes;
    } catch (err) {
      return Response.error(); // Jika benar-benar offline dan memori kosong
    }
  })());
});
