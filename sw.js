/* 신화목장 타이쿤 — 서비스 워커 (게임 v1.5부터 · v2.3 알림)
 * · 바탕화면(홈 화면)에 설치한 게임이 인터넷이 잠깐 끊겨도 열리도록 게임 파일을 이 기기에 저장해 둔다.
 * · 인터넷이 되면 언제나 새 파일을 먼저 받는다(네트워크 먼저) → GitHub에 새 버전을 올리면 다음 실행부터 바로 바뀐다.
 * · 게임 폴더(이 파일이 있는 곳) 안의 GET 요청만 다룬다. 서버(구글)·네이버·글꼴 요청은 손대지 않는다.
 * · 진행 기록은 여기와 상관없이 브라우저 저장소에 그대로 있다.
 * · v2.3 알림: 손님이 게임 [설정]에서 「알림 받기」를 켠 기기에만 온다. 서버가 보낸 알림(제목 t · 내용 b · 종류 k · 묶음 g)을 화면에 띄우고,
 *   누르면 게임을 연다(열려 있으면 그 창을 앞으로). 게임을 보고 있는 중이면 알림 대신 게임 안에서 알려 준다(게임 화면에 전달).
 *   알림 내용은 서버가 만든 글자뿐이고, 여기서는 글자로만 다룬다. */
const CACHE = 'shinhwa-ranch-v1';
const BASE = new URL('./', self.location).pathname;           // 예) /shinhwa-ranch/
const HOME = new URL('./', self.location).href;               // 게임 주소
const CORE = ['./', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon-48.png'];

self.addEventListener('install', event => {
  // 미리 저장(하나라도 못 받으면 나중에 쓰면서 채운다 — 설치 자체는 막지 않음)
  event.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.indexOf('shinhwa-ranch-') === 0 && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.indexOf(BASE) !== 0) return;
  const page = req.mode === 'navigate';                        // 게임 화면(주소에 ?code=… 가 붙어도 같은 파일)
  event.respondWith(fetch(req).then(res => {
    if (res && res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(page ? './' : req, copy)).catch(() => {});
    }
    return res;
  }).catch(err => caches.open(CACHE)
    .then(c => c.match(page ? './' : req, { ignoreSearch: true }))
    .then(hit => { if (hit) return hit; throw err; })));
});

/* ---------- v2.3 알림 ---------- */
const KINDS = ['visit', 'help', 'prot', 'gift', 'credit', 'reject', 'coin', 'test'];
const text = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, n) : '');
/** 사파리 계열(아이폰·아이패드의 홈 화면 앱, 맥 사파리)은 알림을 받을 때마다 꼭 화면에 띄워야 한다(안 띄우면 알림 권한을 거둬 간다) */
const MUST_SHOW = (function () {
  try { const ua = self.navigator.userAgent || ''; return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Edg\/|OPR\/|SamsungBrowser/.test(ua); } catch (e) { return false; }
})();
/** 서버가 보낸 알림 → {k, t, b, g} (모르는 모양이면 기본 문구) */
function readPush(event) {
  let d = null;
  try {
    const j = event.data ? event.data.json() : null;
    d = j && typeof j === 'object' ? (j.data && typeof j.data === 'object' ? j.data : j) : null;
  } catch (e) { d = null; }
  d = d || {};
  const k = KINDS.indexOf(d.k) >= 0 ? d.k : 'news';
  return { k: k, t: text(d.t, 60) || '신화목장 타이쿤', b: text(d.b, 180) || '목장에 새 소식이 있어요. 게임을 열어 확인해 보세요.', g: text(d.g, 20).replace(/[^a-z0-9_-]/gi, '') || 'news' };
}
const gameClients = () => self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  .then(list => list.filter(c => { try { return new URL(c.url).pathname.indexOf(BASE) === 0; } catch (e) { return false; } }));

self.addEventListener('push', event => {
  const d = readPush(event);
  event.waitUntil(gameClients().then(list => {
    const seen = list.filter(c => c.visibilityState === 'visible');
    // 게임을 보고 있으면 게임 안에서 알려 준다. 알림 테스트는 언제나 띄운다(알림이 오는지 눈으로 확인하는 것이니까)
    const show = d.k === 'test' || MUST_SHOW || !seen.length;
    seen.forEach(c => { try { c.postMessage({ srPush: d, shown: show }); } catch (e) { /* 무시 */ } });
    if (!show) return null;
    return self.registration.showNotification(d.t, { body: d.b, icon: 'icon-192.png', tag: 'sr-' + d.g, renotify: true, data: d });
  }, () => self.registration.showNotification(d.t, { body: d.b, icon: 'icon-192.png', tag: 'sr-' + d.g, renotify: true, data: d })));
});

self.addEventListener('notificationclick', event => {
  const raw = event.notification && event.notification.data;
  const d = raw && typeof raw === 'object' ? { k: text(raw.k, 12), t: text(raw.t, 60), b: text(raw.b, 180), g: text(raw.g, 20) } : { k: 'news', t: '', b: '', g: 'news' };
  try { event.notification.close(); } catch (e) { /* 무시 */ }
  event.waitUntil(gameClients().then(list => {
    const c = list.filter(x => x.visibilityState === 'visible')[0] || list[0];
    if (c) {
      try { c.postMessage({ srPushClick: d }); } catch (e) { /* 무시 */ }
      return c.focus ? c.focus().catch(() => null) : null;
    }
    return self.clients.openWindow ? self.clients.openWindow(HOME).catch(() => null) : null;
  }, () => null));
});
