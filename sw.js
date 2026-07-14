// =========================================================================
// SERVICE WORKER (PWA) KAS NAVASENA - ENTERPRISE EDITION
// Architecture: Network-First with Timeout Fallback, Native Garbage Collector
// =========================================================================

const APP_VERSION = '1.0';
const CACHE_PREFIX = 'kas-navasena-';
const CACHE_STATIC = CACHE_PREFIX + 'static-v' + APP_VERSION;
const CACHE_DYNAMIC = CACHE_PREFIX + 'dynamic-v' + APP_VERSION;

// Daftar aset inti yang wajib tersedia saat Offline Total (Tanpa Internet)
const staticAssets = [
  './',
  './index.html', 
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap',
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
// 1. MANAJEMEN MEMORI (GARBAGE COLLECTOR)
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
// 2. FASE INSTALASI (PRE-CACHING & OPAQUE PROXY GUARD)
// =========================================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      console.log('[SW] Menyimpan aset statis NAVASENA...');
      return Promise.all(
        staticAssets.map(asset => {
          const reqOpt = asset.startsWith('http') ? { mode: 'cors', credentials: 'omit' } : { cache: 'no-cache' };
          return fetch(asset, reqOpt)
            .then(response => {
              // Menerima Opaque Response agar instalasi CDN (XLSX.js) tidak gagal di Proxy/Intranet
              if (response.ok || response.type === 'opaque') {
                return cache.put(asset, response);
              }
              throw new Error("Status Jaringan Non-OK: " + response.status);
            })
            .catch((err) => {
              console.error('[SW] FATAL: Aset wajib gagal di-cache:', asset, err);
              throw err; // Hancurkan instalasi agar browser mencoba ulang nanti
            });
       })
      ).then(() => {
        self.skipWaiting(); // Paksa aktivasi setelah cache 100% aman
        if (self.registration.active && 'BroadcastChannel' in self) {
            const bc = new BroadcastChannel('navasena-update-channel');
            bc.postMessage({ type: 'UPDATE_AVAILABLE' });
        }
      });
    })
  );
});

// =========================================================
// 3. FASE AKTIVASI (MENGHAPUS CACHE VERSI LAMA)
// =========================================================
self.addEventListener('activate', event => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key.startsWith(CACHE_PREFIX) && key !== CACHE_STATIC && key !== CACHE_DYNAMIC) {
            console.log('[SW] Menghapus cache versi lama:', key);
            return caches.delete(key);
          }
          return Promise.resolve();
        })
      ).then(() => {
        console.log('[SW] Transisi ke memori cache baru selesai secara mutlak.');
      });
    })
  );
});

// =========================================================
// 4. INTERSEPTOR JARINGAN & FIREWALL
// =========================================================
self.addEventListener('fetch', event => {
  const req = event.request;
  const reqUrl = new URL(req.url);

  if (req.method !== 'GET' || !reqUrl.protocol.startsWith('http') || reqUrl.pathname.endsWith('sw.js')) return;

  // DYNAMIC CACHE SECURITY BLACKLIST
  const isBlacklisted = reqUrl.pathname.match(/\.(xlsx|xls|csv|pdf|zip)$/i) || reqUrl.hostname.includes('google-analytics');
  if (isBlacklisted) {
    event.respondWith(fetch(req).catch(() => Response.error()));
    return;
  }

  // STRATEGI 1: BYPASS GOOGLE CLOUD SYNC (Wajib Network-Only)
  if (reqUrl.hostname.includes('script.google.com') || reqUrl.hostname.includes('script.googleusercontent.com')) {
    return;
  }

  const isHtmlRequest = req.mode === 'navigate' || (req.headers.get('accept') && req.headers.get('accept').includes('text/html'));
  const cacheKey = req.url; 

  // STRATEGI 2: NETWORK-FIRST DENGAN TIMEOUT 3 DETIK (Anti-Zombie State & Anti-Limbo)
  if (isHtmlRequest) {
    const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => reject(new Error('Network Timeout')), 3000);
    });
    timeoutPromise.catch(() => {}); // Dummy trap pencegah Unhandled Promise Rejection System Crash

    // Operasi Fetch dibungkus independen agar Cache tetap terupdate meski koneksi lambat
    const fetchPromise = fetch(req.url, { cache: 'no-cache' }).then(networkResponse => {
      // PROTEKSI MUTLAK: Cegah "Cache Poisoning" oleh Captive Portal (Wi-Fi Publik).
      // Pembaruan App Shell (index.html) HANYA terjadi pada saat install (Kenaikan APP_VERSION).
      if (!networkResponse || !networkResponse.ok) {
         throw new Error('Server Error, Offline, or Captive Portal Interception');
      }
      return networkResponse;
    });

    event.respondWith(
      Promise.race([
        fetchPromise,
        timeoutPromise
      ])
      .catch(() => {
        // FALLBACK: Jika internet mati atau melampaui 3 detik, gunakan memori Offline instan
        return caches.match(req, { ignoreSearch: true })
          .then(res => res || caches.match('./', { ignoreSearch: true }))
          .then(res => res || caches.match('./index.html', { ignoreSearch: true }));
      })
    );
    return;
  }

  // STRATEGI 3: HYBRID GOOGLE FONTS
  if (reqUrl.hostname === 'fonts.googleapis.com') {
    event.respondWith(
      caches.match(req).then(cachedRes => {
        const networkFetch = fetch(req).then(networkRes => {
          if (networkRes && networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(CACHE_STATIC).then(cache => cache.put(req.url, clone));
          }
          return networkRes;
        }).catch(() => Response.error());
        event.waitUntil(networkFetch);
        return cachedRes || networkFetch; // Stale-While-Revalidate
      })
    );
    return;
  } else if (reqUrl.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then(cachedRes => {
        return cachedRes || fetch(req).then(networkRes => {
          if (networkRes && networkRes.ok) { // Cekal Opaque Response Mutlak
            const clone = networkRes.clone();
            caches.open(CACHE_STATIC).then(cache => cache.put(req.url, clone));
          }
          return networkRes;
        }).catch(() => Response.error()); // Cache-First
      })
    );
    return;
  }

  const isLocalStatic = staticAssets.some(asset => {
    if (asset.startsWith('http')) return false;
    return reqUrl.pathname === new URL(asset, self.location.href).pathname;
  });
  const isCDNStatic = staticAssets.some(asset => asset.startsWith('http') && reqUrl.href === asset);

  // STRATEGI 4: CACHE-FIRST UNTUK ASET STATIS (XLSX.js, Ikon, dsb)
  if (isLocalStatic || isCDNStatic) {
    event.respondWith(
      caches.match(cacheKey, { ignoreSearch: true }).then(cachedResponse => {
        return cachedResponse || fetch(req).then(networkResponse => {
          if (networkResponse && networkResponse.ok) { // Cekal Opaque Response Mutlak
            const clone = networkResponse.clone();
            event.waitUntil(caches.open(CACHE_STATIC).then(cache => cache.put(cacheKey, clone)));
          }
          return networkResponse;
        }).catch(() => Response.error());
      })
    );
    return;
  } 

  // STRATEGI 5: STALE-WHILE-REVALIDATE UNTUK ASET DINAMIS LAINNYA
  const cachedResPromise = caches.match(req);
  const networkResPromise = fetch(req).then(networkResponse => {
    if (networkResponse && networkResponse.ok && networkResponse.type !== 'opaque') {
      const clone = networkResponse.clone();
      event.waitUntil(
        caches.open(CACHE_DYNAMIC).then(cache => cache.put(req.url, clone).then(() => limitCacheSize(CACHE_DYNAMIC, 50)))
      );
    }
    return networkResponse;
  }).catch(() => Response.error());

  event.waitUntil(networkResPromise);

  event.respondWith(
    cachedResPromise.then(cachedResponse => {
      return cachedResponse || networkResPromise;
    }).catch(() => Response.error())
  );
});
