// オフラインで使えるように、アプリのファイルをすべて保存しておく
// ファイルを更新したら VERSION の数字を上げる
const VERSION = 'kanji-de-go-v16';
const FILES = [
  './', './index.html', './style.css', './theme.css', './js/theme.js', './js/mapview.js', './lib/drill-ai.js', './fonts/DotGothic16-Regular.ttf', './manifest.webmanifest',
  './js/grades/g1.js', './js/grades/g2.js', './js/grades/g3.js', './js/grades/g4.js', './js/grades/g5.js', './js/grades/g6.js',
  './js/data.js', './js/learn.js', './js/audio.js', './js/scenes.js', './js/three-loader.js', './js/drive3d.js', './lib/three.module.min.js', './js/drive.js', './data/kanjivg.js', './js/radicals.js', './js/strokes.js', './js/pitin.js', './js/ui.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
