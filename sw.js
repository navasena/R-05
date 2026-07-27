/**
 * SERVICE WORKER (PWA) Portal NAVASENA - ENTERPRISE EDITION
 * Architecture: Apex Networking (Stale-While-Revalidate Hybrid, Single-Truth URL)
 * Protection: Opaque Quota Shield, Thread Lockdown GC, Fault-Tolerant Pre-Caching
 */

const APP_VERSION = '2.9';
const CACHE_PREFIX = 'portal-navasena-';
const CACHE_STATIC = CACHE_PREFIX + 'static-v' + APP_VERSION;
const CACHE_DYNAMIC = CACHE_PREFIX + 'dynamic-v' + APP_VERSION;

// THE SINGLE TRUTH STATIC ASSETS
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
      
      const coreAssets = ['./index.html', './manifest.json'];
      const secondaryAssets = staticAssets.filter(a => !coreAssets.includes(a));
      
      // CORE SHELL: Wajib 100% Sukses (Mencegah Hollow Service Worker)
      await Promise.all(
        coreAssets.map(async asset => {
          const response = await fetch(asset, { cache: 'no-cache' });
          if (!response.ok) throw new Error('Core Asset Gagal: ' + asset);
          await cache.put(asset, response);
        })
      );
      
      // ASSETS SEKUNDER: Fault-Tolerant (Menggunakan allSettled)
      await Promise.allSettled(
        secondaryAssets.map(async asset => {
          const reqOpt = asset.startsWith('http') ? { mode: 'cors' } : { cache: 'no-cache' };
          try {
            const response = await fetch(asset, reqOpt);
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
  if (isHtmlRequest) {
    let bgHtmlTask;
    const fetchPromise = fetch(targetReq).then(networkRes => {
      if (networkRes && networkRes.ok) {
        const clone = networkRes.clone();
        bgHtmlTask = (async () => {
          try {
            const cache = await caches.open(CACHE_STATIC);
            await cache.put(targetReq, clone);
          } catch (err) {
            console.warn('[SW] Disk I/O Caching HTML gagal:', err);
          }
        })();
      }
      return networkRes;
    }).catch(() => null); 

    // Thread Lockdown Mutlak
    event.waitUntil((async () => { await fetchPromise; if (bgHtmlTask) await bgHtmlTask; })());
    event.respondWith((async () => {
      const shouldIgnoreQuery = targetReq.url.includes('index.html');
      const cachedRes = await caches.match(targetReq, { ignoreSearch: shouldIgnoreQuery });
      return cachedRes || fetchPromise.then(res => res || Response.error());
    })());
    return;
  }

  // STRATEGI 3: GOOGLE FONTS & EKSTERNAL ASSETS (Opaque Protection & Cache-First)
  if (reqUrl.hostname === 'fonts.googleapis.com' || reqUrl.hostname === 'fonts.gstatic.com') {
    let backgroundTask;
    const respondPromise = (async () => {
      const cachedRes = await caches.match(req);
      if (cachedRes) return cachedRes; 

      try {
        const networkRes = await fetch(req);
        
        if (networkRes && (networkRes.ok || networkRes.type === 'opaque')) {
          const clone = networkRes.clone();
          backgroundTask = (async () => {
            try {
              const cache = await caches.open(CACHE_STATIC);
              await cache.put(req, clone); 
            } catch (err) { console.warn('[SW] Font Cache Write Error:', err); }
          })();
        }
        return networkRes;
      } catch (err) {
        return Response.error();
      }
    })();
    
    event.waitUntil((async () => { await respondPromise; if (backgroundTask) await backgroundTask; })());
    event.respondWith(respondPromise);
    return;
  }

  // STRATEGI 4: STATIC & DYNAMIC ASSETS LAINNYA (Cache-First, Fallback Network)
  let bgDynamicTask;
  const mainRespondPromise = (async () => {
    const cachedRes = await caches.match(req, { ignoreSearch: true });
    if (cachedRes) return cachedRes; 

    try {
      const networkRes = await fetch(req);
      if (networkRes && networkRes.ok && networkRes.type !== 'opaque') {
        const clone = networkRes.clone();
        
        bgDynamicTask = (async () => {
          try {
            const isCoreAsset = staticAssets.some(a => {
              if (a.startsWith('http')) return reqUrl.href === a; 
              const cleanAsset = a.replace('./', '/');
              return reqUrl.pathname.endsWith(cleanAsset);
            });
            const cacheName = isCoreAsset ? CACHE_STATIC : CACHE_DYNAMIC;
            
            const cache = await caches.open(cacheName);
            await cache.put(req, clone);

            if (cacheName === CACHE_DYNAMIC) {
               await limitCacheSize(CACHE_DYNAMIC, 60); 
            }
          } catch (err) { console.warn('[SW] Dynamic Cache Write Error:', err); }
        })();
      }
      return networkRes;
    } catch (err) {
      return Response.error(); 
    }
  })();
  
  event.waitUntil((async () => { await mainRespondPromise; if (bgDynamicTask) await bgDynamicTask; })());
  event.respondWith(mainRespondPromise);
});
