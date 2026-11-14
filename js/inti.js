/* =====================================================================
 * KAS BANDHITS — Inti bersama (halaman publik & admin)
 * Format angka/tanggal, panggilan API ke Apps Script, toast, PWA.
 * ===================================================================== */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG || {};
  var GAS = String(CFG.GAS_URL || '');
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  var KB = window.KB = {
    VERSI: '2.3.0',   // naikkan setiap ada perubahan frontend (lihat CATATAN-VERSI.md)
    BULAN: BULAN, BLN: BLN, HARI: HARI,
    siap: !!GAS && !/GANTI|XXXX/.test(GAS)
  };

  /* ---------- teks & format ---------- */
  KB.esc = function (s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  KB.ic = function (nama, kelas) { return '<span class="ic ' + (kelas || '') + '" aria-hidden="true">' + nama + '</span>'; };
  KB.angka = function (n) { return Math.abs(Math.round(Number(n) || 0)).toLocaleString('id-ID'); };
  KB.rp = function (n) { n = Math.round(Number(n) || 0); return (n < 0 ? '-' : '') + 'Rp ' + KB.angka(n); };
  KB.rpTanda = function (n, tanda) { return (tanda || (n < 0 ? '-' : '+')) + 'Rp ' + KB.angka(n); };
  KB.rpPendek = function (n) {
    n = Number(n) || 0; var a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e9) return s + 'Rp ' + (a / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
    if (a >= 1e6) return s + 'Rp ' + (a / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    if (a >= 1e3) return s + 'Rp ' + (a / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 0 }) + ' rb';
    return s + 'Rp ' + a;
  };
  /** Angka uang dalam span (bisa disamarkan dengan mode privasi). */
  KB.uang = function (n, kelas, tanda) {
    return '<span class="num uang ' + (kelas || '') + '">' + (tanda ? KB.rpTanda(n, tanda) : KB.rp(n)) + '</span>';
  };
  KB.tgl = function (s) { if (!s || s.length < 10) return s || '-'; return +s.slice(8, 10) + ' ' + BLN[+s.slice(5, 7) - 1] + ' ' + s.slice(0, 4); };
  KB.tglPendek = function (s) { if (!s || s.length < 10) return s || '-'; return +s.slice(8, 10) + ' ' + BLN[+s.slice(5, 7) - 1]; };
  KB.tglPanjang = function (s) {
    var d = new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
    return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear();
  };
  KB.bulan = function (k) { return BULAN[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4); };
  KB.bulanPendek = function (k) { return BLN[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4); };
  KB.hariIni = function () {
    var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  };
  KB.jamLalu = function (iso) {
    var s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (!isFinite(s)) return '';
    if (s < 60) return 'baru saja'; if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu'; return Math.floor(s / 86400) + ' hari lalu';
  };
  KB.hLagi = function (n) { return n === 0 ? 'Hari ini' : n === 1 ? 'Besok' : n < 0 ? 'Lewat ' + (-n) + ' hari' : 'H-' + n; };

  /* ---------- penyimpanan lokal (aman bila diblokir) ---------- */
  KB.ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { } }
  };

  /* ---------- API ke Apps Script ---------- */
  function galat(pesan, code) { var e = new Error(pesan); e.code = code || 'ERR'; return e; }
  /**
   * POST JSON ke /exec. Content-Type text/plain agar tidak memicu CORS preflight.
   * Batas waktu default 30 detik (R2). Melempar Error ber-code: NET, TIMEOUT, HTTP, atau kode server.
   */
  KB.api = function (action, data, opsi) {
    opsi = opsi || {};
    if (!KB.siap) return Promise.reject(galat('Konfigurasi belum lengkap: isi GAS_URL di js/config.js.', 'CONFIG'));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, opsi.timeout || 30000);
    var body = { action: action, data: data || {} };
    if (opsi.token) body.token = opsi.token;
    if (opsi.extra) Object.keys(opsi.extra).forEach(function (k) { body[k] = opsi.extra[k]; });
    var t0 = performance.now();
    return fetch(GAS, {
      method: 'POST', redirect: 'follow', signal: ctrl ? ctrl.signal : undefined,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw galat('Server membalas ' + res.status + '.', 'HTTP');
      return res.json().catch(function () { throw galat('Balasan server tidak terbaca.', 'HTTP'); });
    }, function (err) {
      throw err && err.name === 'AbortError' ? galat('Server tidak merespons dalam 30 detik.', 'TIMEOUT') : galat('Tidak dapat terhubung ke server.', 'NET');
    }).then(function (j) {
      KB.perf.push({ a: action, total: Math.round(performance.now() - t0), server: j && j.ms });
      if (KB.perf.length > 80) KB.perf.shift();
      if (!j || j.ok !== true) throw galat((j && j.message) || 'Terjadi kesalahan.', (j && j.code) || 'ERR');
      return j;
    }).finally(function () { clearTimeout(timer); });
  };
  KB.apiGet = function (params, opsi) {
    if (!KB.siap) return Promise.reject(galat('Konfigurasi belum lengkap.', 'CONFIG'));
    var q = Object.keys(params).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, (opsi && opsi.timeout) || 30000);
    return fetch(GAS + (GAS.indexOf('?') < 0 ? '?' : '&') + q, { redirect: 'follow', signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw galat('Server membalas ' + r.status + '.', 'HTTP'); return r.json(); },
        function (err) { throw err && err.name === 'AbortError' ? galat('Server tidak merespons.', 'TIMEOUT') : galat('Tidak dapat terhubung ke server.', 'NET'); })
      .then(function (j) { if (!j || j.ok !== true) throw galat((j && j.message) || 'Terjadi kesalahan.', (j && j.code) || 'ERR'); return j; })
      .finally(function () { clearTimeout(timer); });
  };
  /** Pengukur kinerja: KB.perf di console menampilkan waktu total & waktu server per aksi. */
  KB.perf = [];
  /** Bangunkan server Apps Script lebih awal (maks. 1× per 4 menit). */
  KB.hangatkan = function () {
    if (!KB.siap) return;
    try {
      var t = Number(sessionStorage.getItem('kb_warm') || 0);
      if (Date.now() - t < 240000) return;
      sessionStorage.setItem('kb_warm', String(Date.now()));
    } catch (e) { }
    try { fetch(GAS + (GAS.indexOf('?') < 0 ? '?' : '&') + 'w=1', { mode: 'no-cors' }).catch(function () { }); } catch (e) { }
  };

  /* ---------- toast ---------- */
  KB.toast = function (pesan, jenis, aksi) {
    var w = document.querySelector('.toasts');
    if (!w) { w = document.createElement('div'); w.className = 'toasts'; w.setAttribute('role', 'status'); w.setAttribute('aria-live', 'polite'); document.body.appendChild(w); }
    var el = document.createElement('div');
    el.className = 'toast ' + (jenis || '');
    var ikon = jenis === 'bad' ? 'error' : jenis === 'warn' ? 'warning' : 'check_circle';
    el.innerHTML = KB.ic(ikon) + '<div class="t">' + KB.esc(pesan) + '</div>' + (aksi ? '<button type="button">' + KB.esc(aksi.label) + '</button>' : '');
    if (aksi) el.querySelector('button').addEventListener('click', function () { el.remove(); aksi.fn(); });
    w.appendChild(el);
    setTimeout(function () { el.remove(); }, aksi ? 9000 : (jenis === 'bad' ? 5500 : 3000));
  };

  /* ---------- PWA: service worker & tombol pasang ---------- */
  KB.pasang = { prompt: null, siap: false };
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); KB.pasang.prompt = e; KB.pasang.siap = true;
    document.dispatchEvent(new CustomEvent('kb:pasang'));
  });
  window.addEventListener('appinstalled', function () { KB.pasang.siap = false; KB.pasang.prompt = null; KB.toast('Aplikasi terpasang di perangkat.'); });
  KB.pasangSekarang = function () {
    if (!KB.pasang.prompt) return Promise.resolve(false);
    KB.pasang.prompt.prompt();
    return KB.pasang.prompt.userChoice.then(function (c) { KB.pasang.prompt = null; KB.pasang.siap = false; return c.outcome === 'accepted'; });
  };
  KB.mandiri = function () { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; };
  KB.ios = function () { return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); };
  KB.daftarSW = function () {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    window.addEventListener('load', function () {
      var adaPengendali = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.register('./sw.js').catch(function () { });
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!adaPengendali) return;                       // pemasangan pertama, bukan pembaruan
        KB.toast('Versi baru aplikasi siap.', '', { label: 'Muat ulang', fn: function () { location.reload(); } });
      });
    });
  };
})();
