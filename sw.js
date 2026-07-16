// =========================================================================
// SERVICE WORKER (PWA) KAS NAVASENA - ENTERPRISE EDITION
// Architecture: Network-First with Timeout Fallback, Native Garbage Collector
// =========================================================================

// KODE BARU (Wajib utuh, lolos simulasi, bebas error, TIDAK ADA PEMOTONGAN KODE):

const APP_VERSION = '1.3';
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
  './afk.png',
  './Nasalization%20Rg.otf'
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
// KODE BARU (Wajib utuh, lolos simulasi, bebas error, TIDAK ADA PEMOTONGAN KODE):
        staticAssets.map(asset => {
          // [SURGICAL FIX] mode: 'cors' WAJIB digunakan untuk CDN publik agar lolos validasi CORB/MIME Browser saat Offline.
          const reqOpt = asset.startsWith('http') ? { mode: 'cors' } : { cache: 'no-cache' };
          return fetch(asset, reqOpt)
            .then(response => {
              // Hanya menerima response yang valid dan utuh (Mencegah Opaque Cache Poisoning)
              if (response.ok) {
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
        // [SURGICAL FIX] Broadcast dipindah ke sini karena SW baru terjamin 100% aktif & menguasai Client
        if ('BroadcastChannel' in self) {
            const bc = new BroadcastChannel('navasena-update-channel');
            bc.postMessage({ type: 'UPDATE_AVAILABLE' });
        }
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

// KODE BARU (Wajib utuh, lolos simulasi, bebas error, TIDAK ADA PEMOTONGAN KODE):
  // STRATEGI 2: NETWORK-FIRST DENGAN TIMEOUT 3 DETIK (Anti-Zombie State & Anti-Limbo)
  if (isHtmlRequest) {
    // [SURGICAL FIX] Injeksi AbortController & Timer Pointer untuk Garbage Collection mutlak
    const controller = new AbortController();
    let timeoutId;
    const timeoutPromise = new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
            controller.abort(); // Mutilasi koneksi TCP Zombie secara fisik
            reject(new Error('Network Timeout'));
        }, 3000);
    });
    timeoutPromise.catch(() => {}); // Dummy trap pencegah Unhandled Promise Rejection System Crash

    // Operasi Fetch dibungkus independen agar Cache selalu sinkron dengan versi Server
    const fetchPromise = fetch(req.url, { cache: 'no-cache', signal: controller.signal }).then(networkResponse => {
      clearTimeout(timeoutId); // Matikan bom waktu jika koneksi berhasil cepat
      if (!networkResponse || !networkResponse.ok) {
         throw new Error('Server Error, Offline, or Captive Portal Interception');
      }
      
      const clone = networkResponse.clone();
      // Eksekusi cache.put tanpa event.waitUntil() untuk mencegah InvalidStateError
      caches.open(CACHE_STATIC).then(cache => cache.put(req.url, clone));
      
      return networkResponse;
    }).catch(err => {
      clearTimeout(timeoutId); // Matikan bom waktu jika koneksi gagal (Offline)
      throw err;
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
    // [SURGICAL FIX] Deklarasi networkFetch & event.waitUntil WAJIB diletakkan di luar (synchronous)
    const networkFetch = fetch(req).then(networkRes => {
      if (networkRes && networkRes.ok) {
        const clone = networkRes.clone();
        caches.open(CACHE_STATIC).then(cache => cache.put(req.url, clone));
      }
      return networkRes;
    }).catch(() => Response.error());

    event.waitUntil(networkFetch);

    event.respondWith(
      caches.match(req).then(cachedRes => {
        return cachedRes || networkFetch; // Stale-While-Revalidate
      })
    );
    return;

  } else if (reqUrl.hostname === 'fonts.gstatic.com') {

    event.respondWith(
      caches.match(req).then(cachedRes => {
        if (cachedRes) return cachedRes; // Intersep mutlak untuk efisiensi Cache-First murni
        
                const networkFetch = fetch(req).then(networkRes => {
                  if (networkRes && networkRes.ok) { // Cekal Opaque Response Mutlak
                    const clone = networkRes.clone();
                    // Eksekusi memori langsung. Pembungkusan waitUntil() di dalam promise diharamkan spesifikasi.
                    caches.open(CACHE_STATIC).then(cache => cache.put(req.url, clone));
                  }
                  return networkRes;
                }).catch(() => Response.error());

        
        return networkFetch; 
      })
    );
    return;
  }


  const isLocalStatic = staticAssets.some(asset => {
    if (asset.startsWith('http')) return false;
    return reqUrl.pathname === new URL(asset, self.location.href).pathname;
  });
  const isCDNStatic = staticAssets.some(asset => asset.startsWith('http') && reqUrl.href === asset);

          if (isLocalStatic || isCDNStatic) {
            event.respondWith(
              caches.match(cacheKey, { ignoreSearch: true }).then(cachedResponse => {
                return cachedResponse || fetch(req).then(networkResponse => {
                  if (networkResponse && networkResponse.ok) { // Cekal Opaque Response Mutlak
                    const clone = networkResponse.clone();
                    caches.open(CACHE_STATIC).then(cache => cache.put(cacheKey, clone));
                  }
                  return networkResponse;
                }).catch(() => Response.error());
              })
            );
            return;
          } 

  const cachedResPromise = caches.match(req);
  const networkResPromise = fetch(req).then(networkResponse => {
    if (networkResponse && networkResponse.ok && networkResponse.type !== 'opaque') {
      const clone = networkResponse.clone();
      caches.open(CACHE_DYNAMIC).then(cache => cache.put(req.url, clone).then(() => limitCacheSize(CACHE_DYNAMIC, 50)));
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
