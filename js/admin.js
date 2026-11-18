/* =====================================================================
 * KAS BANDHITS — Dashboard Admin (Super Admin)
 * ---------------------------------------------------------------------
 * Kecepatan: seluruh data dimuat sekali (login / sinkron), semua menu
 * dihitung di perangkat → pindah menu & filter tanpa menunggu server.
 * Anti-dobel (R1/R2): setiap input punya ID dari perangkat, dikirim lewat
 * ANTREAN yang tersimpan di perangkat. Gagal jaringan → dikirim ulang
 * otomatis dengan ID yang sama; server menolak ID yang sudah ada.
 * Data tidak pernah "dibatalkan" karena jaringan, jadi tidak perlu input ulang.
 * ===================================================================== */
(function () {
  'use strict';
  const KB = window.KB, H = window.Hitung, esc = KB.esc, ic = KB.ic, uang = KB.uang;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const KODE_PASTI = ['VALID', 'NOTFOUND', 'TOLAK', 'NOACTION', 'DITOLAK', 'NOSETUP'];
  const TABEL_JENIS = { Pemasukan: 'pemasukan', Pengeluaran: 'pengeluaran' };
  const AWALAN = { pemasukan: 'IN', pengeluaran: 'EX', pinjaman: 'DT', bayar: 'PH', berulang: 'RC', kategori: 'KAT' };
  const IKON_PILIHAN = ['payments', 'redeem', 'work', 'trending_up', 'account_balance', 'savings', 'sell', 'restaurant', 'local_cafe',
    'directions_car', 'local_gas_station', 'shopping_cart', 'shopping_basket', 'receipt_long', 'home', 'bolt', 'wifi', 'smartphone',
    'medical_services', 'school', 'movie', 'sports_esports', 'flight', 'gavel', 'group', 'pets', 'child_care', 'volunteer_activism',
    'checkroom', 'build', 'fitness_center', 'card_giftcard', 'local_hospital', 'subscriptions', 'water_drop', 'credit_card'];
  const WARNA_PILIHAN = ['#17B26A', '#0E9594', '#2E90FA', '#7A5AF8', '#EE46BC', '#F04438', '#EF6820', '#F79009', '#B42318', '#667085', '#0F1C2E'];
  const MENU = [
    ['Utama', [['dashboard', 'Dashboard', 'space_dashboard']]],
    ['Transaksi', [['pemasukan', 'Pemasukan', 'south_west'], ['pengeluaran', 'Pengeluaran', 'north_east'], ['pinjaman', 'Pinjaman', 'account_balance'], ['berulang', 'Berulang', 'event_repeat']]],
    ['Jadwal', [['pengingat', 'Pengingat', 'notifications'], ['kalender', 'Kalender', 'calendar_month']]],
    ['Rencana', [['keinginan', 'Keinginan', 'volunteer_activism']]],
    ['Analisis', [['riwayat', 'Riwayat', 'history'], ['laporan', 'Laporan', 'summarize'], ['proyeksi', 'Proyeksi', 'query_stats']]],
    ['Sistem', [['pengaturan', 'Pengaturan', 'settings']]]
  ];
  const MENU_DATAR = MENU.reduce((a, g) => a.concat(g[1]), []);
  const MENU_TETAP = ['dashboard', 'pengaturan'];                 // tidak bisa disembunyikan
  const LABEL_BNAV = { pemasukan: 'Masuk', pengeluaran: 'Keluar' };
  /** Menu yang disembunyikan lewat Pengaturan → Menu admin (tersimpan di server, berlaku di semua perangkat). */
  const menuSembunyi = () => String((S.data && S.data.set && S.data.set.menu_sembunyi) || '').split(',').filter(x => x && MENU_TETAP.indexOf(x) < 0);
  const menuTampil = (k) => menuSembunyi().indexOf(k) < 0;
  /** Isi navigasi bawah HP: Dashboard + 3 menu tampil pertama (prioritas Pemasukan, Pengeluaran, Pinjaman) + tombol Menu. */
  function slotBnav() {
    const urut = ['pemasukan', 'pengeluaran', 'pinjaman'].concat(MENU_DATAR.map(m => m[0]).filter(k => ['dashboard', 'pemasukan', 'pengeluaran', 'pinjaman', 'pengaturan'].indexOf(k) < 0));
    return ['dashboard'].concat(urut.filter(menuTampil).slice(0, 3));
  }
  function htmlNav() {
    return MENU.map(g => { const isi = g[1].filter(m => menuTampil(m[0])); return isi.length ? `<div class="grp">${g[0]}</div>` + isi.map(m => `<a href="#/${m[0]}" data-nav="${m[0]}">${ic(m[2])}<span>${m[1]}</span>${m[0] === 'pengingat' ? '<span class="badge" data-badge hidden></span>' : ''}</a>`).join('') : ''; }).join('');
  }
  function htmlBnav() {
    return slotBnav().map(k => { const m = MENU_DATAR.find(x => x[0] === k); return `<a href="#/${k}" data-nav="${k}">${ic(m[2])}${LABEL_BNAV[k] || m[1]}</a>`; }).join('') +
      `<a href="#" data-act="menu" data-nav="__menu">${ic('apps')}Menu<span class="badge" data-badge hidden></span></a>`;
  }

  /* ===================== STATE ===================== */
  const S = {
    sesi: KB.ls.get('kb_sesi', null), ver: KB.ls.get('kb_ver', 0), data: KB.ls.get('kb_data', null), ob: KB.ls.get('kb_ob', []),
    k: KB.ls.get('kb_k', ''), cid: KB.ls.get('kb_cid', ''), tema: KB.ls.get('kb_tema', 'terang'), privasi: KB.ls.get('kb_privasi', false),
    rev: 1, sinkronT: 0, galat: ''
  };
  const UI = { view: 'dashboard', shell: false };
  let _uidT = 0;
  function uid(p) { let t = Date.now(); if (t <= _uidT) t = _uidT + 1; _uidT = t; return p + '-' + t + '-' + (1000 + Math.floor(Math.random() * 9000)); }
  function dataKosong() { return { pemasukan: [], pengeluaran: [], pinjaman: [], bayar: [], berulang: [], kategori: [], keinginan: [], set: { nama_app: 'Kas Bandhits', publik_aktif: 'on', logo_url: '', publik_keinginan: 'on', menu_sembunyi: '', dash_sembunyi: '', publik_sembunyi: '', idul_fitri: '' } }; }
  function normal(d) {
    const o = dataKosong();
    if (!d) return o;
    Object.keys(o).forEach(k => { if (k === 'set') o.set = Object.assign(o.set, d.set || {}); else if (Array.isArray(d[k])) o[k] = d[k]; });
    // Nilai yang masuk ke atribut style/ikon divalidasi ulang (bisa saja diketik langsung di Sheets).
    o.kategori = o.kategori.map(k => Object.assign({}, k, {
      warna: /^#[0-9a-fA-F]{6}$/.test(k.warna) ? k.warna : '#667085', ikon: /^[a-z0-9_]{2,40}$/.test(k.ikon) ? k.ikon : 'sell' }));
    if (o.set.logo_url && !/^https:\/\//.test(o.set.logo_url)) o.set.logo_url = '';
    return o;
  }
  if (S.data) S.data = normal(S.data);
  let _simpanT = null;
  function simpanSekarang() { clearTimeout(_simpanT); _simpanT = null; if (S.data) { KB.ls.set('kb_data', S.data); KB.ls.set('kb_ver', S.ver); } }
  function simpanData() { clearTimeout(_simpanT); _simpanT = setTimeout(simpanSekarang, 250); }
  // Simpan segera saat halaman ditutup / dipindah ke latar belakang (HP sering mematikan tab).
  window.addEventListener('pagehide', () => { if (_simpanT) simpanSekarang(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && _simpanT) simpanSekarang(); });
  function simpanOb() { KB.ls.set('kb_ob', S.ob); }
  function sesiValid() { return !!(S.sesi && S.sesi.token && S.sesi.exp > Date.now() + 15000); }
  const cari = (arr, id) => arr.find(x => x.id === id);
  const sama = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const angkaDari = (v) => Number(String(v || '').replace(/[^\d]/g, '')) || 0;

  /* ===================== MODEL (dihitung sekali per perubahan) ===================== */
  let _m = null, _mKey = '';
  function M() {
    const t = KB.hariIni(), key = S.rev + '|' + t;
    if (_mKey === key) return _m;
    const d = S.data;
    _m = { t, kini: H.bk(t) };
    const lazy = (nama, fn) => Object.defineProperty(_m, nama, { get() { const v = fn(); Object.defineProperty(_m, nama, { value: v }); return v; }, configurable: true });
    lazy('pinjaman', () => H.semuaPinjaman(d, t));
    lazy('saldo', () => H.saldoKas(d, t));
    lazy('bulan', () => H.totalBulan(d, _m.kini, t));
    lazy('proy', () => H.proyeksi(d, t, 36));
    lazy('pg', () => H.pengingat(d, t));
    lazy('gab', () => H.gabung(d));
    _mKey = key;
    return _m;
  }
  function katMeta(tipe, nama) {
    const k = S.data.kategori.find(x => x.tipe === tipe && sama(x.nama, nama));
    if (k) return k;
    if (tipe === 'Cicilan' || /^cicilan /i.test(nama)) return { ikon: 'account_balance', warna: '#0E9594' };
    return { ikon: tipe === 'Pemasukan' ? 'south_west' : 'north_east', warna: '#667085' };
  }
  function ikonKat(meta, ukuran) {
    return `<div class="ico" style="background:${meta.warna}1f;color:${meta.warna}${ukuran ? ';width:' + ukuran + 'px;height:' + ukuran + 'px' : ''}">${ic(meta.ikon)}</div>`;
  }

  /* ===================== ANTREAN KIRIM (outbox) ===================== */
  function terapkan(op) {
    const d = S.data;
    if (op.act === 'simpan') {
      const r = Object.assign({}, op.rec, { _p: 1 });
      if (op.tabel === 'bayar') { const p = cari(d.pinjaman, r.pid); if (p) r.pihak = p.pihak; }
      const arr = d[op.tabel], i = arr.findIndex(x => x.id === r.id);
      if (i < 0) arr.push(r); else arr[i] = Object.assign({}, arr[i], r);
      if (op.tabel === 'pinjaman' && i > -1) d.bayar.forEach(b => { if (b.pid === r.id) b.pihak = r.pihak; });
    } else if (op.act === 'hapus') {
      if (op.tabel === 'pinjaman' && d.pinjaman.some(x => x.id === op.id)) {
        d.bayar.filter(b => b.pid === op.id).forEach((b, j) => d.pengeluaran.push({ id: 'EX-' + (Date.now() + j) + '-0', tgl: b.tgl, kat: 'Tagihan',
          ket: 'Cicilan ' + b.pihak + (b.ket ? ' - ' + b.ket : ''), nom: b.nom, _p: 1, _lokal: 1 }));
        d.bayar = d.bayar.filter(b => b.pid !== op.id);
      }
      d[op.tabel] = d[op.tabel].filter(x => x.id !== op.id);
    } else if (op.act === 'set') d.set[op.kunci] = op.nilai;
    S.rev++;
  }
  /** Tambahkan operasi. Operasi dengan cid sama (ketuk ganda) diabaikan. */
  function antre(op) {
    op.cid = op.cid || uid('OP');
    if (S.ob.some(o => o.cid === op.cid)) return false;
    op.t = Date.now();
    terapkan(op); S.ob.push(op); simpanOb(); simpanData();
    render(); pompa();
    return true;
  }
  function kirimOp(op) {
    const bersih = (r) => { const o = Object.assign({}, r); delete o._p; delete o._lokal; return o; };
    if (op.act === 'simpan') return panggil('rec.simpan', { tabel: op.tabel, rec: bersih(op.rec), baru: !!op.baru });
    if (op.act === 'hapus') return panggil('rec.hapus', { tabel: op.tabel, id: op.id });
    return panggil('set.simpan', { kunci: op.kunci, nilai: op.nilai });
  }
  // tahan: antrean dihentikan sementara (backend lama/berkas tidak serasi, atau galat server berulang) — data tetap di perangkat.
  const P = { jalan: false, timer: null, coba: 0, cobaErr: 0, tahan: null, cekT: null };
  const backendLama = () => !!KB.vServer && KB.versiBanding(KB.vServer, KB.BACKEND_MIN) < 0;
  function tahanAntre(code, message) {
    P.tahan = { code, message };
    clearTimeout(P.cekT);
    if (code !== 'ERR') P.cekT = setTimeout(cekUlangTahan, 60000);   // backend mungkin sudah diperbarui → periksa otomatis
    renderRingan();
  }
  function cekUlangTahan() {
    clearTimeout(P.cekT); P.cekT = null;
    const t = P.tahan; P.tahan = null; P.cobaErr = 0;
    const lanjut = () => { pompa(); renderRingan(); };
    if (t && t.code === 'BACKEND') sinkron(true).then(lanjut, lanjut); else lanjut();
  }
  function pompa() {
    if (P.jalan || P.timer || !S.ob.length) return statusSync();
    if (P.tahan) return statusSync();
    if (backendLama()) return tahanAntre('BACKEND', 'Backend masih versi ' + KB.vServer + ', aplikasi ini butuh ' + KB.BACKEND_MIN + ' atau lebih baru. Tempel Kode.gs dan Hitung.gs terbaru di Apps Script, lalu Kelola deployment → Edit → Versi baru. Perubahan Anda aman di perangkat dan dikirim otomatis setelah backend diperbarui.');
    if (!sesiValid()) { statusSync(); return mintaLogin(); }
    const op = S.ob[0];
    P.jalan = true; statusSync();
    kirimOp(op).then(j => {
      P.coba = 0; P.cobaErr = 0; S.ob.shift(); simpanOb();
      const r = j.r || {};
      if (op.act === 'simpan') {
        const x = cari(S.data[op.tabel], op.rec.id);
        if (x) { delete x._p; if (r.rec && r.rec.pihak) x.pihak = r.rec.pihak; }
      }
      const beda = j.prev !== undefined && j.prev !== S.ver && !r.dup;
      if (j.ver) S.ver = j.ver;
      S.rev++; simpanData();
      if (r.perluSinkron || beda) sinkron(true);
      renderRingan();
    }).catch(e => {
      if (e.code === 'AUTH') return;                        // panggil() sudah meminta login ulang
      if (KODE_PASTI.indexOf(e.code) > -1) {                // pasti ditolak server → batalkan & ambil data server
        S.ob.shift(); simpanOb();
        KB.toast(e.message + ' Perubahan dibatalkan.', 'bad');
        if (op.act === 'simpan' && op.baru) { S.data[op.tabel] = S.data[op.tabel].filter(x => x.id !== op.rec.id); S.rev++; render(); }
        return sinkron(true, true);
      }
      if (e.code === 'VERSI') return tahanAntre('VERSI', e.message);          // berkas backend tidak serasi → tahan, jangan buang
      if (e.code === 'ERR' && ++P.cobaErr >= 3) return tahanAntre('ERR', e.message);   // galat server berulang → jangan sumbat antrean diam-diam
      P.coba++;                                             // belum pasti → kirim ulang ID yang sama (aman)
      const jeda = [1500, 5000, 15000, 30000, 60000][Math.min(P.coba - 1, 4)];
      if (P.coba === 2) KB.toast('Koneksi bermasalah. Data aman di perangkat dan dikirim otomatis — jangan input ulang.', 'warn');
      P.timer = setTimeout(() => { P.timer = null; pompa(); }, jeda);
    }).finally(() => {
      P.jalan = false;
      if (!P.timer && S.ob.length && sesiValid()) setTimeout(pompa, 0);
      statusSync();
    });
  }
  window.addEventListener('online', () => { if (P.timer) { clearTimeout(P.timer); P.timer = null; } pompa(); sinkron(false); });

  /* ===================== PANGGILAN SERVER ===================== */
  function panggil(action, data, opsi) {
    if (!sesiValid()) { mintaLogin(); const e = new Error('Sesi berakhir.'); e.code = 'AUTH'; return Promise.reject(e); }
    return KB.api(action, data, Object.assign({ token: S.sesi.token }, opsi || {})).catch(e => {
      if (e.code === 'AUTH') { S.sesi = null; KB.ls.del('kb_sesi'); mintaLogin(); }
      throw e;
    });
  }
  const SK = { jalan: false };
  function sinkron(paksa, penuh) {
    if (!sesiValid() || SK.jalan) return Promise.resolve();
    if (!paksa && Date.now() - S.sinkronT < 20000) return Promise.resolve();
    SK.jalan = true; statusSync();
    return panggil('data.sinkron', { ver: penuh ? 0 : S.ver }).then(j => {
      S.sinkronT = Date.now(); S.galat = '';
      if (j.r.same) return;
      S.data = normal(j.r.data); S.ver = j.r.ver;
      S.ob.forEach(terapkan);                                // operasi yang belum terkirim tetap di atas data server
      S.rev++; simpanData(); render();
    }).catch(e => { if (e.code !== 'AUTH') S.galat = e.message; })
      .finally(() => { SK.jalan = false; statusSync(); });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && UI.shell) { sinkron(false); pompa(); } });

  /* ===================== LOGIN (Google OAuth 2.0) ===================== */
  let gisJanji = null;
  function muatGIS() {
    if (gisJanji) return gisJanji;
    gisJanji = new Promise((ok, gagal) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = ok; s.onerror = () => { gisJanji = null; gagal(new Error('Google Sign-In tidak dapat dimuat.')); };
      document.head.appendChild(s);
    });
    return gisJanji;
  }
  function kartuGerbang(judul, isi) {
    const logo = (S.data && S.data.set.logo_url) || 'assets/logo.svg';
    return `<div class="card kartu" role="dialog" aria-labelledby="gjudul">
      <img src="${esc(logo)}" alt="" width="56" height="56" style="border-radius:14px">
      <div><h1 id="gjudul">${esc(judul)}</h1><p class="mt8">${isi}</p></div>
      <div class="gbtn" id="gbtn"><div class="skel" style="width:260px;height:44px;border-radius:22px"></div></div>
      <p class="sub" id="gstat" role="status" aria-live="polite"></p>
      <div class="note" style="text-align:left">${ic('shield_lock')}<div>Hanya akun Google Super Admin yang dapat masuk. Sesi berlaku 2 jam.</div></div>
      <a href="./" class="sub">${ic('arrow_back', 's16')} Ke ringkasan publik</a></div>`;
  }
  function setGstat(t, buruk) { const el = $('#gstat'); if (el) { el.textContent = t; el.style.color = buruk ? 'var(--red-d)' : ''; } }
  function siapkanGoogle() {
    const pasang = (cid) => muatGIS().then(() => {
      /* global google */
      google.accounts.id.initialize({ client_id: cid, callback: onKredensial, auto_select: true, cancel_on_tap_outside: false, itp_support: true, use_fedcm_for_prompt: true });
      const w = $('#gbtn'); if (!w) return;
      w.innerHTML = '';
      google.accounts.id.renderButton(w, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'id', width: 280 });
      google.accounts.id.prompt();
    }).catch(e => setGstat(e.message + ' Periksa koneksi lalu muat ulang.', true));
    if (S.cid) pasang(S.cid);
    KB.api('auth.cek', {}, { extra: { k: S.k } }).then(j => {
      const baru = j.r.clientId;
      if (baru !== S.cid) { S.cid = baru; KB.ls.set('kb_cid', baru); pasang(baru); }
    }).catch(e => {
      if (e.code === 'NOKEY') { KB.ls.del('kb_k'); KB.ls.del('kb_cid'); S.k = ''; layarNetral(); }
      else if (e.code === 'NOSETUP') setGstat(e.message, true);
      else if (!S.cid) setGstat(e.message + ' Coba muat ulang halaman.', true);
    });
  }
  function onKredensial(resp) {
    setGstat('Memverifikasi akun Google…');
    KB.api('auth.masuk', {}, { extra: { k: S.k, idToken: resp.credential }, timeout: 45000 }).then(j => {
      const r = j.r;
      S.sesi = { token: r.token, exp: r.exp, email: r.email, nama: r.nama, foto: r.foto };
      KB.ls.set('kb_sesi', S.sesi);
      S.data = normal(r.data); S.ver = r.ver; S.sinkronT = Date.now();
      S.ob.forEach(terapkan); S.rev++; simpanData();
      const ov = $('.overlay-login'); if (ov) ov.remove();
      if (!UI.shell) bangunShell();
      render(); pompa();
      KB.toast('Selamat datang, ' + (r.nama || r.email) + '.');
    }).catch(e => {
      if (e.code === 'NOKEY') { KB.ls.del('kb_k'); S.k = ''; return layarNetral(); }
      setGstat(e.message, true);
      try { google.accounts.id.disableAutoSelect(); } catch (x) { }
    });
  }
  function layarGerbang() {
    document.body.innerHTML = `<div class="gerbang">${kartuGerbang('Masuk Admin Kas Bandhits', 'Kelola pemasukan, pengeluaran, pinjaman, dan proyeksi saldo.')}</div>`;
    UI.shell = false; siapkanGoogle();
  }
  function mintaLogin() {
    if (!UI.shell) return S.k ? layarGerbang() : layarNetral();
    if ($('.overlay-login')) return;
    if (!S.k) return layarNetral();
    const ov = document.createElement('div');
    ov.className = 'overlay-login';
    ov.innerHTML = kartuGerbang('Sesi berakhir', 'Masuk lagi untuk melanjutkan. Data yang belum terkirim tetap aman di perangkat.');
    document.body.appendChild(ov);
    siapkanGoogle(); statusSync();
  }
  function layarNetral() {
    UI.shell = false;
    const mandiri = KB.mandiri();
    document.body.innerHTML = `<div class="gerbang"><div class="card kartu">
      <div class="seg-ic">${ic('travel_explore')}</div><h1>Halaman tidak tersedia</h1>
      <p>Alamat yang Anda buka tidak dikenali.</p>
      <a class="btn pri" href="./">${ic('dashboard')}Buka ringkasan keuangan</a>
      ${mandiri ? `<form id="fkunci" class="stack" style="width:100%;text-align:left"><div class="field"><label for="ikunci">Alamat akses</label>
        <input id="ikunci" class="inp" autocomplete="off" placeholder="Tempel alamat akses lengkap"></div><button class="btn blk">Lanjut</button></form>` : ''}
      </div></div>`;
    const f = $('#fkunci');
    if (f) f.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = $('#ikunci').value.trim(), m = /[?&]k=([A-Za-z0-9]+)/.exec(v);
      const k = m ? m[1] : v;
      if (k) { S.k = k; KB.ls.set('kb_k', k); layarGerbang(); }
    });
  }
  function layarPesan(ikon, judul, isi) {
    document.body.innerHTML = `<div class="gerbang"><div class="card kartu"><div class="seg-ic">${ic(ikon)}</div><h1>${esc(judul)}</h1><p>${esc(isi)}</p></div></div>`;
  }
  function keluar() {
    const lanjut = () => {
      const tok = S.sesi && S.sesi.token;
      if (tok) KB.api('sesi.keluar', {}, { token: tok }).catch(() => { });
      try { google.accounts.id.disableAutoSelect(); } catch (e) { }
      ['kb_sesi', 'kb_data', 'kb_ver', 'kb_ob'].forEach(KB.ls.del);
      S.sesi = null; S.data = null; S.ob = [];
      layarGerbang();
    };
    const n = S.ob.length;
    konfirmasi('Keluar dari dashboard?', n ? `Masih ada ${n} data yang belum terkirim ke server. Bila keluar sekarang, data itu hilang.` : 'Data di perangkat ini dihapus. Masuk lagi dengan akun Google Super Admin.', n ? 'Keluar & buang' : 'Keluar', !!n).then(ok => ok && lanjut());
  }

  /* ===================== KERANGKA (shell) ===================== */
  function bangunShell() {
    UI.shell = true;
    const nav = htmlNav(); UI.navKunci = menuSembunyi().join(',');
    document.body.innerHTML = `<div class="app">
      <aside class="sidebar" aria-label="Navigasi utama">
        <div class="brand"><img data-logo src="assets/logo.svg" alt=""><div><b data-nama>Kas Bandhits</b><small>Finance Core</small></div></div>
        <nav class="nav">${nav}</nav>
        <div class="side-foot"><div class="akun" data-akun></div></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="brand-m"><img data-logo src="assets/logo.svg" alt=""></div>
          <div class="judul" data-judul>Dashboard</div><span class="sp"></span>
          <button class="sync" type="button" data-act="sinkron" data-sync title="Status sinkron"><span class="dot"></span><span>Tersinkron</span></button>
          <button class="btn ghost ico" type="button" data-act="privasi" title="Sembunyikan/tampilkan nominal" aria-label="Sembunyikan nominal">${ic('visibility')}</button>
          <button class="btn pri ico" type="button" data-act="tambah-cepat" title="Catat transaksi" aria-label="Catat transaksi">${ic('add')}</button>
        </header>
        <main class="view" id="view" tabindex="-1"></main>
      </div>
      <nav class="bnav" aria-label="Navigasi bawah">${htmlBnav()}</nav></div>`;
    document.body.classList.toggle('privasi', !!S.privasi);
    bacaHash();
  }
  function aturShell() {
    if (!UI.shell) return;
    const m = MENU_DATAR.find(x => x[0] === UI.view) || MENU_DATAR[0];
    const kunciNav = menuSembunyi().join(',');
    if (kunciNav !== UI.navKunci) {                       // pengaturan menu berubah → susun ulang navigasi
      UI.navKunci = kunciNav;
      const nv = $('.sidebar .nav'), bn = $('.bnav'); if (nv) nv.innerHTML = htmlNav(); if (bn) bn.innerHTML = htmlBnav();
    }
    const lain = slotBnav();
    $$('[data-nav]').forEach(a => a.classList.toggle('aktif', a.dataset.nav === UI.view || (a.dataset.nav === '__menu' && lain.indexOf(UI.view) < 0)));
    $('[data-judul]').textContent = m[1];
    const set = S.data.set;
    $$('[data-logo]').forEach(i => { const src = set.logo_url || 'assets/logo.svg'; if (i.getAttribute('src') !== src) i.src = src; });
    $$('[data-nama]').forEach(e => { e.textContent = set.nama_app || 'Kas Bandhits'; });
    document.title = m[1] + ' · ' + (set.nama_app || 'Kas Bandhits');
    const n = M().pg.tujuhHari.length;
    $$('[data-badge]').forEach(b => { b.hidden = !n; b.textContent = n > 99 ? '99+' : n; });
    const ak = $('[data-akun]');
    if (ak && S.sesi) {
      const av = S.sesi.foto ? `<img src="${esc(S.sesi.foto)}" alt="" referrerpolicy="no-referrer">` : `<span class="av">${esc((S.sesi.nama || S.sesi.email || '?')[0].toUpperCase())}</span>`;
      ak.innerHTML = `${av}<div class="t"><b>${esc(S.sesi.nama || 'Super Admin')}</b><small>${esc(S.sesi.email)}</small></div><button class="btn ghost ico sm" type="button" data-act="keluar" title="Keluar" style="color:var(--navy-txt)">${ic('logout', 's18')}</button>`;
    }
    const pv = $('[data-act="privasi"] .ic'); if (pv) pv.textContent = S.privasi ? 'visibility_off' : 'visibility';
  }
  function statusSync() {
    const el = $('[data-sync]'); if (!el) return;
    let kelas = '', teks = 'Tersinkron';
    if (!sesiValid() && UI.shell) { kelas = 'galat'; teks = 'Perlu masuk'; }
    else if (P.tahan && S.ob.length) { kelas = 'galat'; teks = 'Tertahan (' + S.ob.length + ')'; }
    else if (P.jalan || SK.jalan) { kelas = 'kirim'; teks = S.ob.length ? 'Menyimpan ' + S.ob.length : 'Memeriksa…'; }
    else if (S.ob.length) { kelas = 'tunda'; teks = 'Menunggu kirim (' + S.ob.length + ')'; }
    else if (S.galat) { kelas = 'tunda'; teks = 'Offline'; }
    el.className = 'sync ' + kelas;
    el.lastElementChild.textContent = teks;
    el.title = S.galat ? S.galat : S.sinkronT ? 'Terakhir diperiksa ' + KB.jamLalu(new Date(S.sinkronT).toISOString()) : '';
  }
  function bacaHash() {
    const v = (location.hash.replace(/^#\/?/, '').split('?')[0]) || 'dashboard';
    UI.view = MENU_DATAR.some(m => m[0] === v) ? v : 'dashboard';
    render(); window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { if (UI.shell) { tutupDrawer(); bacaHash(); } });

  function render() {
    if (!UI.shell || !S.data) return;
    aturShell(); statusSync();
    const view = $('#view'), fn = VIEW[UI.view] || VIEW.dashboard;
    const ae = document.activeElement, fid = ae && ae.id && view.contains(ae) ? ae.id : null;
    let pos = null; try { pos = fid ? ae.selectionStart : null; } catch (e) { }
    view.innerHTML = htmlTahan() + fn();
    if (fid) { const el = document.getElementById(fid); if (el) { el.focus(); try { if (pos !== null) el.setSelectionRange(pos, pos); } catch (e) { } } }
    if (AFTER[UI.view]) AFTER[UI.view]();
  }
  let _rrT = null;
  function renderRingan() { clearTimeout(_rrT); _rrT = setTimeout(() => { if (!$('.drawer.on')) render(); else { aturShell(); statusSync(); } }, 60); }

  /* Pemberitahuan antrean tertahan, tampil di atas setiap halaman sampai beres. */
  function htmlTahan() {
    if (!P.tahan || !S.ob.length) return '';
    const t = P.tahan, op = S.ob[0], LBL = { pemasukan: 'pemasukan', pengeluaran: 'pengeluaran', pinjaman: 'pinjaman', bayar: 'pembayaran cicilan', berulang: 'transaksi berulang', kategori: 'kategori', keinginan: 'keinginan' };
    const apa = op.act === 'set' ? 'pengaturan ' + op.kunci : (op.act === 'hapus' ? 'hapus ' : op.baru ? 'tambah ' : 'ubah ') + (LBL[op.tabel] || op.tabel) +
      (op.rec ? ' "' + (op.rec.ket || op.rec.nama || op.rec.pihak || op.rec.kat || op.rec.id) + '"' : '');
    return `<div class="note bad mb12 tahan" role="alert">${ic('error')}<div><b>${t.code === 'ERR' ? 'Perubahan tidak bisa disimpan server' : 'Penyimpanan ditahan: backend perlu diperbarui'}</b><br>${esc(t.message)}
      <br><small>${S.ob.length} perubahan menunggu di perangkat · yang pertama: ${esc(apa)}</small>
      <div class="row mt8" style="gap:8px">${t.code === 'ERR' ? btn('tahan-coba', 'Coba lagi', 'refresh', 'sm') + btn('tahan-buang', 'Buang perubahan ini', 'delete', 'danger sm') : btn('tahan-cek', 'Periksa lagi', 'refresh', 'sm')}</div></div></div>`;
  }

  /* ===================== POTONGAN TAMPILAN ===================== */
  const pageH = (lbl, judul, sub, aksi) => `<div class="page-h"><div class="t"><span class="lbl">${lbl}</span><h1>${judul}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="act">${aksi || ''}</div></div>`;
  const metric = (lbl, nilai, foot, ikon, warna, kelas) => `<div class="card metric ${kelas || ''}"><div class="top"><span class="lbl">${lbl}</span>${ikon ? `<span class="ibox" style="color:${warna || 'var(--teal-d)'}">${ic(ikon, 's18')}</span>` : ''}</div><div class="v">${nilai}</div>${foot ? `<div class="foot">${foot}</div>` : ''}</div>`;
  const kosong = (ikon, judul, isi, aksi) => `<div class="kosong">${ic(ikon)}<b>${judul}</b>${isi ? `<span>${isi}</span>` : ''}${aksi || ''}</div>`;
  const pend = (x) => x._p ? ` <span class="pill info">${ic('sync', 's16')}Menyinkronkan</span>` : '';
  const btn = (act, label, ikon, kelas, attrs) => `<button type="button" class="btn ${kelas || ''}" data-act="${act}" ${attrs || ''}>${ikon ? ic(ikon) : ''}${label ? `<span>${label}</span>` : ''}</button>`;
  function statusPill(j) {
    if (j.status === 'Lunas') return `<span class="pill ok">${ic('check_circle', 's16')}Lunas</span>`;
    if (j.status === 'Terlambat') return `<span class="pill bad">${ic('error', 's16')}Terlambat ${-j.hariLagi} hari</span>`;
    if (j.status === 'Segera') return `<span class="pill warn">${ic('schedule', 's16')}${KB.hLagi(j.hariLagi)}</span>`;
    return `<span class="pill nt">${ic('event', 's16')}${KB.tglPendek(j.berikut.tgl)}</span>`;
  }
  function rowTx(x, opsi) {
    opsi = opsi || {};
    const jenis = x.jenis || (opsi.tabel === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran');
    const tabel = jenis === 'Cicilan' ? 'bayar' : TABEL_JENIS[jenis];
    const masuk = jenis === 'Pemasukan';
    const meta = katMeta(jenis, x.kat);
    const aksi = opsi.aksi === false || x._lokal ? '' : `<div class="aksi">
      ${jenis !== 'Cicilan' ? `<button type="button" class="btn ghost ico sm" data-act="ubah-tx" data-tabel="${tabel}" data-id="${esc(x.id)}" title="Ubah" aria-label="Ubah">${ic('edit', 's18')}</button>` : ''}
      <button type="button" class="btn danger ico sm" data-act="hapus" data-tabel="${tabel}" data-id="${esc(x.id)}" title="${jenis === 'Cicilan' ? 'Batalkan pembayaran' : 'Hapus'}" aria-label="Hapus">${ic('delete', 's18')}</button></div>`;
    return `<div class="trow ${x._p ? 'pending' : ''}">${ikonKat(meta)}
      <div class="t"><b>${esc(x.kat)}</b><small>${opsi.tanpaTgl ? '' : esc(KB.tgl(x.tgl)) + (x.ket ? ' · ' : '')}${esc(x.ket || '')}${opsi.tanpaTgl && !x.ket ? esc(jenis) : ''}${pend(x)}</small></div>
      <div class="n ${masuk ? 'plus' : 'minus'}">${uang(x.nom, '', masuk ? '+' : '-')}${opsi.label ? `<small>${esc(opsi.label === true ? (jenis === 'Cicilan' ? 'Cicilan' : jenis) : opsi.label)}</small>` : ''}</div>${aksi}</div>`;
  }
  function itemDue(it, opsi) {
    const telat = it.hariLagi < 0, segera = !telat && it.hariLagi <= 7;
    const d = it.tgl;
    return `<div class="due ${it.lunas ? '' : telat ? 'telat' : segera ? 'segera' : ''}">
      <div class="tg"><b>${+d.slice(8)}</b><small>${KB.BLN[+d.slice(5, 7) - 1]}</small></div>
      <div class="t"><b>${esc(it.pihak)}</b><small>Cicilan ${it.ke}/${it.dari} · ${it.lunas ? 'Lunas' : KB.hLagi(it.hariLagi)}</small></div>
      <div style="text-align:right">${uang(it.lunas ? it.nominal : it.sisa, 'num')}${!it.lunas && opsi !== false ? `<div class="mt8">${btn('bayar', 'Bayar', '', 'pri sm', `data-pid="${esc(it.pid)}"`)}</div>` : ''}</div></div>`;
  }

  /* ===================== GRAFIK (SVG tanpa pustaka) ===================== */
  function grafikGaris(rows) {
    const W = 860, Hh = 240, pl = 64, pr = 16, pt = 16, pb = 30;
    const vals = rows.map(r => r.saldoAkhir), mn = Math.min(0, ...vals), mx = Math.max(0, ...vals) || 1;
    const sx = i => pl + (W - pl - pr) * (rows.length < 2 ? 0 : i / (rows.length - 1));
    const sy = v => pt + (Hh - pt - pb) * (1 - (v - mn) / ((mx - mn) || 1));
    const pts = rows.map((r, i) => sx(i).toFixed(1) + ',' + sy(r.saldoAkhir).toFixed(1));
    const tick = [mn, mn + (mx - mn) / 2, mx];
    const iMin = vals.indexOf(Math.min(...vals));
    let g = `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Grafik proyeksi saldo ${rows.length} bulan">`;
    tick.forEach(v => { g += `<line class="grid-l" x1="${pl}" x2="${W - pr}" y1="${sy(v)}" y2="${sy(v)}"/><text x="${pl - 8}" y="${sy(v) + 4}" text-anchor="end">${esc(KB.rpPendek(v).replace('Rp ', ''))}</text>`; });
    if (mn < 0) g += `<line class="nol" x1="${pl}" x2="${W - pr}" y1="${sy(0)}" y2="${sy(0)}"/>`;
    g += `<polygon points="${sx(0)},${sy(Math.max(mn, 0))} ${pts.join(' ')} ${sx(rows.length - 1)},${sy(Math.max(mn, 0))}" fill="rgba(14,149,148,.10)"/>`;
    g += `<polyline points="${pts.join(' ')}" fill="none" stroke="#0E9594" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    rows.forEach((r, i) => { if (i % 6 === 0 || i === rows.length - 1) g += `<text x="${sx(i)}" y="${Hh - 8}" text-anchor="middle">${esc(KB.bulanPendek(r.bulan).replace(' 20', " '"))}</text>`; });
    g += `<circle cx="${sx(iMin)}" cy="${sy(vals[iMin])}" r="4.5" fill="${vals[iMin] < 0 ? '#F04438' : '#F79009'}" stroke="#fff" stroke-width="2"/>`;
    g += `<circle cx="${sx(0)}" cy="${sy(vals[0])}" r="4" fill="#0F1C2E" stroke="#fff" stroke-width="2"/>`;
    return g + '</svg>';
  }
  function grafikBatang(data) {
    const W = 520, Hh = 190, pl = 8, pb = 26, pt = 10, n = data.length, bw = (W - pl * 2) / n;
    const mx = Math.max(1, ...data.map(d => Math.max(d.masuk, d.keluar)));
    const h = v => (Hh - pb - pt) * v / mx;
    let g = `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="Pemasukan dan pengeluaran ${n} bulan">`;
    g += `<line class="grid-l" x1="0" x2="${W}" y1="${Hh - pb}" y2="${Hh - pb}"/>`;
    data.forEach((d, i) => {
      const x = pl + i * bw, w = Math.min(22, bw / 3.2);
      g += `<rect x="${x + bw / 2 - w - 2}" y="${Hh - pb - h(d.masuk)}" width="${w}" height="${Math.max(1, h(d.masuk))}" rx="3" fill="#17B26A"><title>Masuk ${KB.rp(d.masuk)}</title></rect>`;
      g += `<rect x="${x + bw / 2 + 2}" y="${Hh - pb - h(d.keluar)}" width="${w}" height="${Math.max(1, h(d.keluar))}" rx="3" fill="#F04438"><title>Keluar ${KB.rp(d.keluar)}</title></rect>`;
      g += `<text x="${x + bw / 2}" y="${Hh - 8}" text-anchor="middle">${esc(KB.BLN[+d.bulan.slice(5, 7) - 1])}</text>`;
    });
    return g + '</svg>';
  }

  /* ===================== MENU / VIEW ===================== */
  const VIEW = {}, AFTER = {};

  /* ---------- Dashboard ---------- */
  /* Bagian dashboard yang bisa ditampilkan/disembunyikan (tersimpan di server, sama di semua perangkat). */
  const DASH = [['kpi', 'Saldo, pemasukan & pengeluaran', 'account_balance_wallet', 'Tiga kartu ringkasan di paling atas'],
    ['tempo', 'Pengingat jatuh tempo 7 hari', 'notifications_active', 'Cicilan yang jatuh tempo dalam 7 hari'],
    ['proyeksi', 'Proyeksi saldo 4 bulan', 'query_stats', 'Tabel saldo akhir bulan berjalan s.d. 3 bulan ke depan'],
    ['terakhir', 'Transaksi terakhir', 'receipt_long', '8 catatan terbaru'],
    ['arus', 'Arus kas 6 bulan', 'bar_chart', 'Grafik pemasukan vs pengeluaran'],
    ['kategori', 'Pengeluaran terbesar bulan ini', 'donut_large', '5 kategori pengeluaran terbesar']];
  const dashSembunyi = () => String((S.data.set && S.data.set.dash_sembunyi) || '').split(',').filter(Boolean);
  const dashTampil = (k) => dashSembunyi().indexOf(k) < 0;
  function htmlDashAtur() {
    return DASH.map(d => `<div class="set-row menu-row ${dashTampil(d[0]) ? '' : 'mati'}"><div class="t"><b>${ic(d[2], 's18')}${d[1]}</b><small>${d[3]}${dashTampil(d[0]) ? '' : ' · disembunyikan'}</small></div>
      <label class="switch"><input type="checkbox" data-act="dash-tampil" data-k="${d[0]}" ${dashTampil(d[0]) ? 'checked' : ''} aria-label="Tampilkan ${d[1]}"><span></span></label></div>`).join('');
  }
  /* Bagian halaman publik yang bisa ditampilkan/disembunyikan. Disaring di server, jadi data bagian yang
     disembunyikan tidak terkirim ke pengunjung. Keinginan memakai saklar lamanya sendiri (publik_keinginan). */
  const PUB = [['saldo', 'Saldo kas', 'account_balance_wallet', 'Kartu saldo utama di paling atas'],
    ['kpi', 'Pemasukan & pengeluaran bulan ini', 'swap_vert', 'Dua kartu total bulan berjalan'],
    ['kat_masuk', 'Pemasukan terbesar bulan ini', 'pie_chart', '5 kategori pemasukan teratas beserta nominalnya'],
    ['kat_keluar', 'Pengeluaran terbesar bulan ini', 'donut_large', '5 kategori pengeluaran teratas beserta nominalnya'],
    ['tempo', 'Pengingat jatuh tempo', 'notifications_active', 'Per minggu, awal bulan depan, dan tunggakan · memuat nama pemberi pinjaman'],
    ['proyeksi', 'Proyeksi 12 bulan', 'query_stats', 'Saldo awal, pemasukan, pengeluaran, dan saldo akhir tiap bulan'],
    ['keinginan', 'Keinginan & hajatan', 'volunteer_activism', 'Hanya butir yang diizinkan tampil di menu Keinginan'],
    ['terbaru', 'Transaksi terbaru', 'receipt_long', '5 catatan terakhir beserta keterangannya']];
  const pubSembunyi = () => String((S.data.set && S.data.set.publik_sembunyi) || '').split(',').filter(Boolean);
  const pubTampil = (k) => k === 'keinginan' ? S.data.set.publik_keinginan !== 'off' : pubSembunyi().indexOf(k) < 0;
  function htmlPubAtur() {
    const bocor = !pubTampil('saldo') && pubTampil('proyeksi');
    const bocorKpi = !pubTampil('kpi') && (pubTampil('kat_masuk') || pubTampil('kat_keluar'));
    return PUB.map(d => `<div class="set-row menu-row ${pubTampil(d[0]) ? '' : 'mati'}"><div class="t"><b>${ic(d[2], 's18')}${d[1]}</b><small>${d[3]}${pubTampil(d[0]) ? '' : ' · disembunyikan'}</small></div>
      <label class="switch"><input type="checkbox" data-act="pub-tampil" data-k="${d[0]}" ${pubTampil(d[0]) ? 'checked' : ''} aria-label="Tampilkan ${d[1]} di halaman publik"><span></span></label></div>`).join('') +
      (bocor ? `<div class="card-b"><div class="note warn">${ic('warning')}<div>Saldo kas disembunyikan, tetapi <b>Proyeksi</b> masih menampilkan saldo awal dan saldo akhir tiap bulan, jadi saldo tetap bisa diperkirakan. Sembunyikan Proyeksi juga bila perlu.</div></div></div>` : '') +
      (bocorKpi ? `<div class="card-b"><div class="note warn">${ic('warning')}<div>Pemasukan &amp; pengeluaran disembunyikan, tetapi kartu <b>kategori terbesar</b> masih menampilkan nominal per kategori, jadi totalnya bisa diperkirakan.</div></div></div>` : '');
  }
  VIEW.dashboard = function () {
    const m = M(), b = m.bulan, p0 = m.proy[0], lalu = H.totalBulan(S.data, H.geserBulan(m.kini, -1));
    const delta = (a, z) => z ? Math.round((a - z) / z * 100) : null;
    const dIn = delta(b.pemasukan, lalu.pemasukan), dOut = delta(b.pengeluaran, lalu.pengeluaran);
    const chipD = (v, baikNaik) => v === null ? '' : `<span class="pill ${(v >= 0) === baikNaik ? 'ok' : 'bad'}">${v >= 0 ? '+' : ''}${v}% vs bln lalu</span>`;
    const jam = new Date().getHours(), salam = jam < 11 ? 'Selamat pagi' : jam < 15 ? 'Selamat siang' : jam < 18 ? 'Selamat sore' : 'Selamat malam';
    const enamBulan = []; for (let i = 5; i >= 0; i--) { const k = H.geserBulan(m.kini, -i), t = H.totalBulan(S.data, k, i === 0 ? m.t : null); enamBulan.push({ bulan: k, masuk: t.pemasukan, keluar: t.pengeluaran }); }
    const katBulan = {}; S.data.pengeluaran.forEach(x => { if (H.bk(x.tgl) === m.kini && x.tgl <= m.t) katBulan[x.kat] = (katBulan[x.kat] || 0) + Number(x.nom); });
    const katTop = Object.keys(katBulan).map(k => [k, katBulan[k]]).sort((a, z) => z[1] - a[1]).slice(0, 5), katTot = katTop.reduce((s, x) => s + x[1], 0) || 1;
    const due = m.pg.tujuhHari, terbaru = m.gab.filter(x => x.tgl <= m.t).slice(0, 8);
    return pageH('Ringkasan', 'Dashboard', `<b>${salam}${S.sesi && S.sesi.nama ? ', ' + esc(S.sesi.nama.split(' ')[0]) : ''}.</b> ${esc(KB.tglPanjang(m.t))}`,
      btn('dash-atur', 'Atur tampilan', 'tune', 'ghost' + (UI.dashAtur ? ' on' : ''), `aria-expanded="${!!UI.dashAtur}"`) + btn('bayar-pilih', 'Catat cicilan', 'account_balance', '') + btn('tx-baru', 'Pengeluaran', 'north_east', '', 'data-jenis="Pengeluaran"') + btn('tx-baru', 'Pemasukan', 'south_west', 'pri', 'data-jenis="Pemasukan"')) +
      dashSusun({
        kpi: `<div class="grid g3">
        ${metric('Saldo kas saat ini', uang(m.saldo), `Akhir bulan ini setelah cicilan: <b class="num uang" style="color:#fff">${KB.rp(p0.saldoAkhir)}</b>`, 'account_balance_wallet', '', 'hero')}
        ${metric('Pemasukan ' + KB.BULAN[+m.kini.slice(5) - 1], `<span class="plus">${uang(b.pemasukan)}</span>`, `${b.jmlPemasukan} transaksi ${chipD(dIn, true)}`, 'south_west', 'var(--green-d)')}
        ${metric('Pengeluaran ' + KB.BULAN[+m.kini.slice(5) - 1], `<span class="minus">${uang(b.pengeluaran)}</span>`, `${b.jmlPengeluaran} transaksi${b.cicilan ? ' · cicilan ' + uang(b.cicilan) : ''} ${chipD(dOut, false)}`, 'north_east', 'var(--red-d)')}
      </div>`,
        tempo: `<div class="card"><div class="card-h">${ic('notifications_active', 's18')}<h2>Pengingat jatuh tempo 7 hari</h2><span class="sp"></span><a href="#/pengingat" class="sub">Semua pengingat ${ic('chevron_right', 's16')}</a></div>
        <div class="card-b">${due.length ? `<div class="hscroll">${due.map(it => itemDue(it)).join('')}</div>` : kosong('event_available', 'Tidak ada cicilan dalam 7 hari ke depan', m.pg.sisaBulan ? 'Sisa cicilan bulan ini ' + KB.rp(m.pg.sisaBulan) : '')}</div></div>`,
        proyeksi: `<div class="card"><div class="card-h">${ic('query_stats', 's18')}<h2>Proyeksi saldo 4 bulan</h2><span class="sp"></span><a href="#/proyeksi" class="sub">36 bulan ${ic('chevron_right', 's16')}</a></div>
          <div class="tbl-w desk-saja"><table class="tbl"><thead><tr><th>Bulan</th><th class="r">Pemasukan</th><th class="r">Pengeluaran</th><th class="r">Cicilan</th><th class="r">Saldo akhir</th></tr></thead><tbody>
          ${m.proy.slice(0, 4).map(r => `<tr class="${r.berjalan ? 'sorot' : ''}"><td>${esc(KB.bulanPendek(r.bulan))}</td><td class="r plus">${uang(r.pemasukan)}</td><td class="r minus">${uang(r.pengeluaran)}</td><td class="r">${uang(r.cicilan)}</td><td class="r"><b class="${r.saldoAkhir < 0 ? 'minus' : ''}">${uang(r.saldoAkhir)}</b></td></tr>`).join('')}
          </tbody></table></div>
          <div class="list hp-saja">${m.proy.slice(0, 4).map(r => `<div class="trow" style="min-height:52px${r.berjalan ? ';background:var(--teal-bg)' : ''}"><div class="t"><b>${esc(KB.bulanPendek(r.bulan))}${r.berjalan ? ' · berjalan' : ''}</b><small>Masuk ${KB.rpPendek(r.pemasukan)} · keluar ${KB.rpPendek(r.pengeluaran)} · cicilan ${KB.rpPendek(r.cicilan)}</small></div><div class="n ${r.saldoAkhir < 0 ? 'minus' : ''}">${uang(r.saldoAkhir)}<small>saldo akhir</small></div></div>`).join('')}</div>
          ${p0.tunggakan ? `<div class="card-f"><span class="pill bad">${ic('warning', 's16')}Termasuk tunggakan ${KB.rp(p0.tunggakan)}</span></div>` : ''}</div>`,
        terakhir: `<div class="card"><div class="card-h">${ic('receipt_long', 's18')}<h2>Transaksi terakhir</h2><span class="sp"></span><a href="#/riwayat" class="sub">Riwayat ${ic('chevron_right', 's16')}</a></div>
          <div class="list">${terbaru.length ? terbaru.map(x => rowTx(x, { aksi: false })).join('') : kosong('receipt_long', 'Belum ada transaksi', 'Mulai catat pemasukan atau pengeluaran.')}</div></div>`,
        arus: `<div class="card"><div class="card-h">${ic('bar_chart', 's18')}<h2>Arus kas 6 bulan</h2><span class="sp"></span><div class="legend"><span><i class="dot" style="background:#17B26A"></i>Masuk</span><span><i class="dot" style="background:#F04438"></i>Keluar</span></div></div><div class="card-b">${grafikBatang(enamBulan)}</div></div>`,
        kategori: `<div class="card"><div class="card-h">${ic('donut_large', 's18')}<h2>Pengeluaran terbesar bulan ini</h2></div><div class="card-b">${katTop.length ? `<div class="bars">${katTop.map(k => { const mt = katMeta('Pengeluaran', k[0]); return `<div class="bar-r"><span class="row" style="min-width:0">${ic(mt.ikon, 's18')}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(k[0])}</span></span><span class="b"><i style="width:${Math.round(k[1] / katTot * 100)}%;background:${mt.warna}"></i></span>${uang(k[1])}</div>`; }).join('')}</div>` : kosong('pie_chart', 'Belum ada pengeluaran bulan ini')}</div></div>`
      });
  };
  /** Susun bagian dashboard yang tampil. Pasangan (proyeksi+terakhir, arus+kategori) melebar penuh bila tinggal satu. */
  function dashSusun(b) {
    const t = (k) => dashTampil(k) ? b[k] : '';
    const duo = (kelas, a, z) => a && z ? `<div class="grid ${kelas}">${a}${z}</div>` : (a || z);
    const isi = [t('kpi'), t('tempo'), duo('g-73', t('proyeksi'), t('terakhir')), duo('g2', t('arus'), t('kategori'))].filter(Boolean);
    const atur = UI.dashAtur ? `<div class="card dash-atur"><div class="card-h">${ic('tune', 's18')}<h2>Atur tampilan dashboard</h2><span class="sp"></span>${dashSembunyi().length ? btn('dash-semua', 'Tampilkan semua', 'visibility', 'ghost sm') : ''}${btn('dash-atur', 'Selesai', 'check', 'sm')}</div>${htmlDashAtur()}</div>` : '';
    if (!isi.length) isi.push(`<div class="card">${kosong('visibility_off', 'Semua bagian dashboard disembunyikan', 'Tampilkan lagi lewat tombol Atur tampilan atau Pengaturan → Bagian dashboard.', UI.dashAtur ? '' : btn('dash-atur', 'Atur tampilan', 'tune', 'pri mt8'))}</div>`);
    return `<div class="dash-blok">${atur}${isi.join('')}</div>`;
  }

  /* ---------- Pemasukan / Pengeluaran ---------- */
  function viewBuku(jenis) {
    const tabel = TABEL_JENIS[jenis], st = UI[tabel] = UI[tabel] || { q: '', kat: '', bln: '', urut: 'baru', n: 150 };
    const m = M(), semua = S.data[tabel], masuk = jenis === 'Pemasukan';
    const jml = (arr) => arr.reduce((s, x) => s + Number(x.nom), 0);
    const bulanIni = semua.filter(x => H.bk(x.tgl) === m.kini && x.tgl <= m.t);
    const rata = [1, 2, 3].map(i => jml(semua.filter(x => H.bk(x.tgl) === H.geserBulan(m.kini, -i)))).reduce((a, b) => a + b, 0) / 3;
    const perKat = {}; bulanIni.forEach(x => { perKat[x.kat] = (perKat[x.kat] || 0) + Number(x.nom); });
    const top = Object.keys(perKat).sort((a, b) => perKat[b] - perKat[a])[0];
    const q = st.q.trim().toLowerCase();
    let rows = semua.filter(x => (!st.kat || sama(x.kat, st.kat)) && (!st.bln || H.bk(x.tgl) === st.bln) &&
      (!q || (x.kat + ' ' + x.ket + ' ' + x.nom + ' ' + KB.tgl(x.tgl)).toLowerCase().indexOf(q) > -1));
    rows = rows.slice().sort(st.urut === 'besar' ? (a, b) => b.nom - a.nom : st.urut === 'kecil' ? (a, b) => a.nom - b.nom : st.urut === 'lama' ? (a, b) => (a.tgl > b.tgl ? 1 : a.tgl < b.tgl ? -1 : H.idWaktu(a.id) - H.idWaktu(b.id)) : (a, b) => (a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : H.idWaktu(b.id) - H.idWaktu(a.id)));
    const total = jml(rows), tampil = rows.slice(0, st.n);
    const kats = Array.from(new Set(semua.map(x => x.kat).concat(S.data.kategori.filter(k => k.tipe === jenis).map(k => k.nama)))).sort((a, b) => a.localeCompare(b));
    const bulanAda = Array.from(new Set(semua.map(x => H.bk(x.tgl)))).sort().reverse();
    let list = '', grp = null;
    if (st.urut === 'baru' || st.urut === 'lama') {
      const sub = {}; rows.forEach(x => { const k = H.bk(x.tgl); sub[k] = sub[k] || { n: 0, t: 0 }; sub[k].n++; sub[k].t += Number(x.nom); });
      tampil.forEach(x => {
        const k = H.bk(x.tgl);
        if (k !== grp) { grp = k; list += `<div class="grp-h">${ic('calendar_today', 's16')}<b>${esc(KB.bulan(k))}</b><span class="pill nt">${sub[k].n} transaksi</span><span class="sp"></span><span class="lbl">Subtotal</span>${uang(sub[k].t, masuk ? 'plus' : 'minus')}</div>`; }
        list += rowTx(x, { tabel });
      });
    } else list = tampil.map(x => rowTx(x, { tabel })).join('');
    return pageH(masuk ? 'Buku besar pemasukan' : 'Buku besar pengeluaran', masuk ? 'Pemasukan' : 'Pengeluaran',
      masuk ? 'Gaji, usaha, bonus, dan dana pinjaman yang cair ke rekening.' : 'Belanja dan tagihan. Pembayaran cicilan dicatat di menu Pinjaman.',
      btn('csv-buku', 'Ekspor CSV', 'download', '', `data-jenis="${jenis}"`) + btn('tx-baru', 'Tambah ' + jenis.toLowerCase(), 'add', 'pri', `data-jenis="${jenis}"`)) +
      `<div class="grid g3">
        ${metric('Bulan berjalan (' + KB.BLN[+m.kini.slice(5) - 1] + ')', `<span class="${masuk ? 'plus' : 'minus'}">${uang(jml(bulanIni))}</span>`, `${bulanIni.length} transaksi s.d. hari ini`, masuk ? 'trending_up' : 'trending_down', masuk ? 'var(--green-d)' : 'var(--red-d)')}
        ${metric('Rata-rata 3 bulan terakhir', uang(rata), 'Bulan penuh sebelum bulan ini', 'analytics')}
        ${metric('Kategori terbesar bulan ini', top ? esc(top) : '—', top ? uang(perKat[top]) : 'Belum ada data', 'category')}
      </div>
      <div class="card mt16">
        <div class="card-h wrap" style="gap:8px">
          <div class="cari">${ic('search')}<input id="q-${tabel}" class="inp" type="search" placeholder="Cari kategori, keterangan, nominal…" value="${esc(st.q)}" data-filter="${tabel}" data-f="q" autocomplete="off"></div>
          <select class="inp" style="width:auto;height:36px" data-filter="${tabel}" data-f="kat" aria-label="Filter kategori"><option value="">Semua kategori</option>${kats.map(k => `<option ${sama(k, st.kat) ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
          <select class="inp" style="width:auto;height:36px" data-filter="${tabel}" data-f="bln" aria-label="Filter bulan"><option value="">Semua bulan</option>${bulanAda.map(k => `<option value="${k}" ${k === st.bln ? 'selected' : ''}>${esc(KB.bulan(k))}</option>`).join('')}</select>
          <select class="inp" style="width:auto;height:36px" data-filter="${tabel}" data-f="urut" aria-label="Urutkan">${[['baru', 'Terbaru'], ['lama', 'Terlama'], ['besar', 'Nominal terbesar'], ['kecil', 'Nominal terkecil']].map(o => `<option value="${o[0]}" ${o[0] === st.urut ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>
        </div>
        ${(q || st.kat || st.bln) ? `<div class="card-f" style="border-top:0;border-bottom:1px solid var(--border)"><span class="sub">${rows.length} hasil · total ${uang(total)}</span><span class="sp"></span>${btn('reset-filter', 'Hapus filter', 'filter_alt_off', 'ghost sm', `data-tabel="${tabel}"`)}</div>` : ''}
        <div class="list">${tampil.length ? list : kosong(masuk ? 'savings' : 'shopping_bag', semua.length ? 'Tidak ada yang cocok' : 'Belum ada ' + jenis.toLowerCase(), semua.length ? 'Ubah kata kunci atau filter.' : 'Ketuk tombol Tambah untuk mencatat.')}</div>
        ${rows.length > st.n ? `<div class="lebih">${btn('lebih', 'Tampilkan ' + Math.min(150, rows.length - st.n) + ' lagi', 'expand_more', 'sm', `data-st="${tabel}"`)}</div>` : ''}
      </div>`;
  }
  VIEW.pemasukan = () => viewBuku('Pemasukan');
  VIEW.pengeluaran = () => viewBuku('Pengeluaran');

  /* ---------- Pinjaman ---------- */
  VIEW.pinjaman = function () {
    const st = UI.pin = UI.pin || { f: 'aktif', buka: {} };
    const m = M(), semua = m.pinjaman, aktif = semua.filter(j => j.status !== 'Lunas');
    const daftar = st.f === 'aktif' ? aktif : st.f === 'lunas' ? semua.filter(j => j.status === 'Lunas') : semua;
    const totSisa = aktif.reduce((s, j) => s + j.sisa, 0);
    const bebas = aktif.reduce((mx, j) => j.tglLunas > mx ? j.tglLunas : mx, '');
    const kartu = (j) => {
      const b = j.berikut, buka = st.buka[j.id], p = cari(S.data.pinjaman, j.id) || {};
      return `<div class="card loan ${j.status === 'Lunas' ? 'lunas' : ''}">
        <div class="lh"><div class="ico">${ic('account_balance')}</div><div style="flex:1;min-width:0"><b>${esc(j.pihak)}</b><small>${esc(j.ket || 'Dicatat ' + KB.tgl(j.tgl))}${pend(p)}</small></div>${statusPill(j)}</div>
        <div class="lm">
          <div><span class="lbl">Total pinjaman</span><b class="num uang">${KB.rp(j.nom)}</b></div>
          <div><span class="lbl">Sisa</span><b class="num uang ${j.sisa ? 'minus' : 'plus'}">${KB.rp(j.sisa)}</b></div>
          <div><span class="lbl">Cicilan / bulan</span><b class="num uang">${KB.rp(j.cicilanPerBulan)}</b>${j.cicilanTerakhir !== j.cicilanPerBulan ? `<small class="muted">terakhir ${KB.rp(j.cicilanTerakhir)}</small>` : ''}</div>
          <div><span class="lbl">${b ? 'Berikutnya' : 'Selesai'}</span><b class="num">${b ? esc(KB.tglPendek(b.tgl)) + ' · ' + `<span class="uang">${KB.rp(b.sisa)}</span>` : esc(KB.tgl(j.tglLunas))}</b>${b && b.terbayar ? `<small class="muted">sebagian, sisa cicilan ke-${b.ke}</small>` : b ? `<small class="muted">cicilan ke-${b.ke}</small>` : ''}</div>
        </div>
        <div class="lp"><div class="row"><span class="sub">${j.lunasKe}/${j.jangka} cicilan lunas</span><span class="sp"></span><b class="mono" style="font-size:12px">${j.persen}%</b></div><div class="prog ${j.status === 'Lunas' ? 'ok' : j.status === 'Terlambat' ? 'bad' : ''}"><i style="width:${j.persen}%"></i></div></div>
        <div class="la">${j.status !== 'Lunas' ? btn('bayar', 'Bayar', 'payments', 'pri sm', `data-pid="${esc(j.id)}"`) : ''}${btn('ubah-pinjaman', 'Ubah', 'edit', 'sm', `data-id="${esc(j.id)}"`)}${btn('hapus', '', 'delete', 'danger ico sm', `data-tabel="pinjaman" data-id="${esc(j.id)}" title="Hapus pinjaman" aria-label="Hapus pinjaman"`)}<span class="sp"></span>${btn('pin-detail', buka ? 'Tutup' : 'Jadwal & riwayat', buka ? 'expand_less' : 'expand_more', 'ghost sm', `data-id="${esc(j.id)}"`)}</div>
        ${buka ? `<div class="det"><div class="tbl-w"><table class="tbl"><thead><tr><th>Ke</th><th>Jatuh tempo</th><th class="r">Cicilan</th><th class="r">Sisa</th><th>Status</th></tr></thead><tbody>
          ${j.cicilan.map(c => `<tr><td class="mono">${c.ke}</td><td>${esc(KB.tgl(c.tgl))}</td><td class="r">${uang(c.nominal)}</td><td class="r">${uang(c.sisa)}</td><td>${c.lunas ? '<span class="pill ok">Lunas</span>' : c.terbayar ? '<span class="pill warn">Sebagian</span>' : c.tgl < m.t ? '<span class="pill bad">Terlambat</span>' : '<span class="pill nt">Belum</span>'}</td></tr>`).join('')}
          </tbody></table></div>
          <div class="card-h" style="border-top:1px solid var(--border)"><h2>Riwayat pembayaran</h2><span class="sp"></span><span class="sub">Total ${uang(j.dibayar)}</span></div>
          <div class="list">${j.riwayat.length ? j.riwayat.slice().reverse().map(x => rowTx(Object.assign({ jenis: 'Cicilan', kat: 'Pembayaran ' + KB.tgl(x.tgl) }, x), { tanpaTgl: true })).join('') : kosong('payments', 'Belum ada pembayaran')}</div></div>` : ''}
      </div>`;
    };
    return `<div class="note mb12">${ic('info')}<div><b>Dana pinjaman masuk ke rekening?</b> Catat juga sebagai Pemasukan (kategori "Pinjaman Cair") agar saldo kas tidak selisih. Cicilan barang tidak perlu.</div></div>` +
      pageH('Kewajiban', 'Pinjaman & cicilan', 'Cicilan tanpa bunga. Status dihitung dari total nominal yang sudah dibayar.',
        `<div class="seg" role="tablist">${[['aktif', 'Aktif (' + aktif.length + ')'], ['lunas', 'Lunas'], ['semua', 'Semua']].map(o => `<button type="button" class="${st.f === o[0] ? 'on' : ''}" data-act="pin-f" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>` + btn('pinjaman-baru', 'Tambah pinjaman', 'add', 'pri')) +
      `<div class="grid g4">
        ${metric('Total sisa pinjaman', uang(totSisa), aktif.length + ' pinjaman aktif', 'account_balance', 'var(--red-d)')}
        ${metric('Sisa cicilan bulan ini', uang(m.pg.sisaBulan), 'dari ' + KB.rp(m.pg.totalBulan), 'event_upcoming', 'var(--amber-d)')}
        ${metric('Tunggakan', `<span class="${m.pg.totalTunggakan ? 'minus' : ''}">${uang(m.pg.totalTunggakan)}</span>`, m.pg.tunggakan.length + ' cicilan lewat bulan', 'warning', 'var(--red-d)')}
        ${metric('Perkiraan bebas pinjaman', bebas ? esc(KB.bulanPendek(bebas)) : '—', bebas ? 'cicilan terakhir ' + KB.tgl(bebas) : 'Tidak ada pinjaman aktif', 'verified', 'var(--green-d)')}
      </div>
      <div class="grid g2 mt16">${daftar.length ? daftar.map(kartu).join('') : `<div class="card" style="grid-column:1/-1">${kosong('account_balance', st.f === 'lunas' ? 'Belum ada pinjaman lunas' : 'Tidak ada pinjaman aktif', '', st.f === 'aktif' ? btn('pinjaman-baru', 'Tambah pinjaman', 'add', 'pri mt8') : '')}</div>`}</div>`;
  };

  /* ---------- Transaksi berulang ---------- */
  /* Teks jadwal satu butir berulang: "tiap tgl 25", "tiap 1 Juni", "H-7 Idul Fitri". */
  function jadwalBerulang(b) {
    const f = H.frekBerulang(b);
    if (f === 'Tahunan') return 'tiap ' + b.hari + ' ' + KB.BULAN[(Number(b.bln) || 1) - 1];
    if (f === 'Idul Fitri') return Number(b.sebelum) ? 'H-' + b.sebelum + ' Idul Fitri' : 'tiap Idul Fitri';
    return 'tiap tgl ' + b.hari;
  }
  /* Asal tanggal Idul Fitri: koreksi pemilik, ketetapan pemerintah, atau perkiraan bawaan. */
  function sumberIdulFitri(t) {
    if (String(S.data.set.idul_fitri || '').split(',').indexOf(t) > -1) return ['koreksi Anda', 'ok'];
    if (t === '2026-03-21') return ['Kemenag', 'ok'];
    if (t === '2027-03-10') return ['SKB 3 Menteri, menunggu sidang isbat', 'info'];
    return ['perkiraan', 'warn'];
  }
  /* Templat isi cepat untuk pemasukan sekali setahun. */
  const ISI_BERULANG = {
    thr: { jenis: 'Pemasukan', kat: 'Gaji', ket: 'THR', frek: 'Idul Fitri', sebelum: 0, hari: 1 },
    g13: { jenis: 'Pemasukan', kat: 'Gaji', ket: 'Gaji 13', frek: 'Tahunan', bln: 6, hari: 1 }
  };
  VIEW.berulang = function () {
    const m = M(), depan = H.geserBulan(m.kini, 1), list = S.data.berulang.slice().sort((a, b) => (a.jenis === b.jenis ? 0 : a.jenis > b.jenis ? 1 : -1) || (H.FREK.indexOf(H.frekBerulang(a)) - H.FREK.indexOf(H.frekBerulang(b))) || a.hari - b.hari);
    const aktif = list.filter(b => H.frekBerulang(b) === 'Bulanan' && H.berulangAktif(b, depan, S.data));
    const tIn = aktif.filter(b => b.jenis === 'Pemasukan').reduce((s, b) => s + Number(b.nom), 0), tOut = aktif.filter(b => b.jenis === 'Pengeluaran').reduce((s, b) => s + Number(b.nom), 0);
    const berikut = (b) => H.berulangBerikut(b, b.mulai > depan ? b.mulai : depan, S.data);
    const tahunan = list.filter(b => H.frekBerulang(b) !== 'Bulanan' && b.aktif).map(b => [b, berikut(b)]).filter(x => x[1]).sort((a, z) => a[1] < z[1] ? -1 : 1);
    const adaThr = list.some(b => H.frekBerulang(b) === 'Idul Fitri'), adaG13 = list.some(b => H.frekBerulang(b) === 'Tahunan' && /gaji\s*(ke-?)?13/i.test(b.ket || ''));
    const lebaran = H.tanggalIdulFitri(S.data).filter(t => t >= m.t).slice(0, 4);
    return pageH('Proyeksi otomatis', 'Transaksi berulang', 'Gaji, sewa, langganan, THR, dan Gaji 13. Hanya dipakai proyeksi, mulai bulan berikutnya. Saldo kas tidak berubah sampai Anda mencatat transaksinya.',
      (adaThr ? '' : btn('berulang-isi', 'THR', 'redeem', '', 'data-v="thr"')) + (adaG13 ? '' : btn('berulang-isi', 'Gaji 13', 'payments', '', 'data-v="g13"')) + btn('berulang-baru', 'Tambah berulang', 'add', 'pri')) +
      `<div class="note mb12">${ic('rule')}<div>Bila di bulan itu sudah ada transaksi tercatat dengan <b>jenis, kategori, dan nominal yang sama</b>, butir berulang dilewati agar tidak terhitung dua kali.</div></div>
      <div class="grid g3">
        ${metric('Pemasukan rutin / bulan', `<span class="plus">${uang(tIn)}</span>`, aktif.filter(b => b.jenis === 'Pemasukan').length + ' sumber aktif', 'south_west', 'var(--green-d)')}
        ${metric('Pengeluaran rutin / bulan', `<span class="minus">${uang(tOut)}</span>`, aktif.filter(b => b.jenis === 'Pengeluaran').length + ' pos aktif', 'north_east', 'var(--red-d)')}
        ${metric('Selisih rutin / bulan', `<span class="${tIn - tOut >= 0 ? 'plus' : 'minus'}">${uang(tIn - tOut)}</span>`, 'Berlaku untuk ' + KB.bulan(depan), 'balance')}
      </div>
      ${tahunan.length ? `<div class="card mt16 thn"><div class="card-h">${ic('event_repeat', 's18')}<h2>Sekali setahun berikutnya</h2><span class="sp"></span><small class="muted">Tidak masuk total per bulan, masuk proyeksi di bulan kejadiannya</small></div><div class="list">${tahunan.map(x => {
        const b = x[0], masuk = b.jenis === 'Pemasukan';
        return `<div class="trow">${ikonKat(katMeta(b.jenis, b.kat))}<div class="t"><b>${esc(b.ket || b.kat)}</b><small>${esc(jadwalBerulang(b))} · ${esc(KB.tglPanjang(x[1]))}</small></div><div class="n ${masuk ? 'plus' : 'minus'}">${uang(b.nom, '', masuk ? '+' : '-')}<small>${esc(KB.bulan(H.bk(x[1])))}</small></div></div>`;
      }).join('')}</div></div>` : ''}
      <div class="card mt16"><div class="list">${list.length ? list.map(b => {
        const meta = katMeta(b.jenis, b.kat), on = H.berulangHidup(b, depan) || (b.aktif && b.mulai > depan), f = H.frekBerulang(b);
        return `<div class="trow ${b._p ? 'pending' : ''}" style="${on ? '' : 'opacity:.6'}">${ikonKat(meta)}
          <div class="t"><b>${esc(b.ket || b.kat)}</b><small>${esc(b.kat)} · ${esc(jadwalBerulang(b))} · mulai ${esc(KB.bulanPendek(b.mulai))}${b.selesai ? ' s.d. ' + esc(KB.bulanPendek(b.selesai)) : ''}${pend(b)}</small></div>
          <div class="n ${b.jenis === 'Pemasukan' ? 'plus' : 'minus'}">${uang(b.nom, '', b.jenis === 'Pemasukan' ? '+' : '-')}<small>${f === 'Bulanan' ? 'per bulan' : f === 'Tahunan' ? 'per tahun' : 'per Idul Fitri'}</small></div>
          <label class="switch" title="Aktif"><input type="checkbox" data-act="berulang-aktif" data-id="${esc(b.id)}" ${b.aktif ? 'checked' : ''} aria-label="Aktif"><span></span></label>
          <div class="aksi">${btn('ubah-berulang', '', 'edit', 'ghost ico sm', `data-id="${esc(b.id)}" aria-label="Ubah"`)}${btn('hapus', '', 'delete', 'danger ico sm', `data-tabel="berulang" data-id="${esc(b.id)}" aria-label="Hapus"`)}</div></div>`;
      }).join('') : kosong('event_repeat', 'Belum ada transaksi berulang', 'Tambahkan gaji atau sewa agar proyeksi bulan depan berarti.', btn('berulang-baru', 'Tambah berulang', 'add', 'pri mt8'))}</div></div>
      ${adaThr ? `<div class="card mt16"><div class="card-h">${ic('event', 's18')}<h2>Tanggal Idul Fitri yang dipakai</h2></div>
        <div class="list">${lebaran.map(t => { const sb = sumberIdulFitri(t); return `<div class="trow"><div class="t"><b>${esc(KB.tglPanjang(t))}</b></div><span class="pill ${sb[1]}">${esc(sb[0])}</span></div>`; }).join('')}</div>
        <form class="card-b stack" data-form="idulfitri" style="gap:10px;border-top:1px solid var(--border)">
          <p class="sub">Tanggal resmi ditetapkan pemerintah lewat sidang isbat dan bisa berbeda satu hari dari perkiraan. Isi koreksi bila sudah ada pengumuman; tahun yang diisi menggantikan perkiraan tahun itu.</p>
          <div class="field"><label for="f-idf">Koreksi tanggal <small>format 2028-02-27, pisahkan dengan koma</small></label><input id="f-idf" class="inp" name="idul_fitri" value="${esc(UI.idf !== undefined ? UI.idf : S.data.set.idul_fitri || '')}" placeholder="Kosongkan untuk memakai perkiraan" autocomplete="off"></div>
          <div class="row"><button class="btn pri sm">Simpan tanggal</button></div></form></div>` : ''}`;
  };

  /* ---------- Pengingat ---------- */
  VIEW.pengingat = function () {
    const m = M(), pg = m.pg, mk = H.mingguKe(m.t);
    return pageH('Jadwal', 'Pengingat jatuh tempo', 'Jendela bergulir 7 hari dan jadwal cicilan ' + esc(KB.bulan(m.kini)) + ' per minggu.', btn('kalender-sinkron', 'Sinkron ke Google Calendar', 'event', '')) +
      `<div class="grid g3">
        ${metric('Jatuh tempo 7 hari', uang(pg.total7), pg.tujuhHari.length + ' cicilan termasuk yang terlambat', 'schedule', 'var(--amber-d)')}
        ${metric('Tunggakan', `<span class="${pg.totalTunggakan ? 'minus' : ''}">${uang(pg.totalTunggakan)}</span>`, pg.tunggakan.length ? pg.tunggakan.length + ' cicilan bulan sebelumnya' : 'Tidak ada tunggakan', 'warning', 'var(--red-d)')}
        ${metric('Kewajiban ' + KB.BULAN[+m.kini.slice(5) - 1], uang(pg.sisaBulan), 'belum dibayar dari ' + KB.rp(pg.totalBulan), 'event_note')}
      </div>
      <div class="card mt16"><div class="card-h">${ic('priority_high', 's18')}<h2>Perlu dibayar dalam 7 hari</h2></div><div class="card-b">
        ${pg.tujuhHari.length ? `<div class="stack" style="gap:8px">${pg.tujuhHari.map(it => itemDue(it)).join('')}</div>` : kosong('task_alt', 'Aman', 'Tidak ada cicilan jatuh tempo atau terlambat dalam 7 hari.')}</div></div>
      <h2 class="mt16 mb12" style="margin-top:22px">Siklus mingguan ${esc(KB.bulan(m.kini))}</h2>
      <div class="minggu">${pg.minggu.map((w, i) => `<div class="card mg ${i === mk ? 'kini' : ''}"><div class="row"><span class="lbl">Minggu ${w.ke}</span><span class="sp"></span><small class="mono muted">${+w.dari.slice(8)}–${+w.sampai.slice(8)} ${KB.BLN[+w.dari.slice(5, 7) - 1]}</small></div>
        ${w.items.length ? w.items.map(it => `<div class="it ${it.lunas ? 'lunas' : ''}"><div class="row"><b style="font-size:13px">${esc(it.pihak)}</b><span class="sp"></span>${it.lunas ? `<span class="pill ok">${ic('check', 's16')}Lunas</span>` : `<span class="pill ${it.hariLagi < 0 ? 'bad' : it.hariLagi <= 7 ? 'warn' : 'nt'}">${esc(KB.tglPendek(it.tgl))}</span>`}</div><div class="row"><small class="muted">Cicilan ${it.ke}/${it.dari}</small><span class="sp"></span>${uang(it.lunas ? it.nominal : it.sisa)}</div>${!it.lunas ? `<div class="row mt8">${btn('bayar', 'Bayar', '', 'sm blk', `data-pid="${esc(it.pid)}"`)}</div>` : ''}</div>`).join('') : `<div class="kosong" style="padding:16px 4px">${ic(i < mk ? 'task_alt' : 'event_available')}<small>Tidak ada jadwal</small></div>`}
        ${w.items.length ? `<div class="row" style="margin-top:auto"><small class="muted">Total</small><span class="sp"></span><b>${uang(w.total)}</b></div>` : ''}</div>`).join('')}</div>
      ${pg.tunggakan.length ? `<div class="card mt16"><div class="card-h">${ic('error', 's18')}<h2>Tunggakan bulan sebelumnya</h2></div><div class="card-b stack" style="gap:8px">${pg.tunggakan.map(it => itemDue(it)).join('')}</div></div>` : ''}`;
  };

  /* ---------- Kalender ---------- */
  VIEW.kalender = function () {
    const m = M(), st = UI.kal = UI.kal || { bln: m.kini, pilih: m.t, f: 'semua' };
    const ev = H.kalender(S.data, st.bln, m.t), y = +st.bln.slice(0, 4), mo = +st.bln.slice(5, 7);
    const awal = (new Date(y, mo - 1, 1).getDay() + 6) % 7, nHari = H.hariAkhir(y, mo);
    const sel = (e) => st.f === 'semua' || (st.f === 'cicilan' ? e.tipe === 'cicilan' : e.tipe === 'berulang');
    let total = 0; Object.keys(ev).forEach(k => ev[k].forEach(e => { if (e.tipe === 'cicilan' && sel(e)) total += e.nominal; }));
    let cells = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map(d => `<div class="hd">${d}</div>`).join('');
    const nSel = Math.ceil((awal + nHari) / 7) * 7;
    for (let i = 0; i < nSel; i++) {
      const d = i - awal + 1;
      if (d < 1 || d > nHari) { cells += '<div class="c luar" aria-hidden="true"></div>'; continue; }
      const tg = st.bln + '-' + String(d).padStart(2, '0'), es = (ev[tg] || []).filter(sel);
      cells += `<button type="button" class="c ${tg === m.t ? 'hari-ini' : ''} ${tg === st.pilih ? 'pilih' : ''}" data-act="kal-pilih" data-tgl="${tg}" aria-label="${esc(KB.tgl(tg))}, ${es.length} jadwal">
        <span class="d">${d}</span>${es.slice(0, 3).map(e => `<span class="ev ${e.tipe === 'cicilan' ? 'cic' + (e.lunas ? ' lunas' : '') : e.jenis === 'Pemasukan' ? 'in' : 'out'}">${esc(e.judul)}</span>`).join('')}${es.length > 3 ? `<span class="faint" style="font-size:10px">+${es.length - 3}</span>` : ''}
        <span class="dots">${es.slice(0, 4).map(e => `<i class="dot" style="background:${e.tipe === 'cicilan' ? (e.lunas ? 'var(--faint)' : 'var(--red)') : e.jenis === 'Pemasukan' ? 'var(--green)' : 'var(--amber)'}"></i>`).join('')}</span></button>`;
    }
    const pilihEv = (H.bk(st.pilih) === st.bln ? (ev[st.pilih] || []) : H.kalender(S.data, H.bk(st.pilih), m.t)[st.pilih] || []).filter(sel);
    return pageH('Jadwal', 'Kalender jatuh tempo', 'Cicilan pinjaman dan transaksi berulang dalam satu tampilan.', btn('kalender-sinkron', 'Sinkron ke Google Calendar', 'event', '')) +
      `<div class="card"><div class="card-h wrap">
        ${btn('kal-geser', '', 'chevron_left', 'ghost ico', 'data-n="-1" aria-label="Bulan sebelumnya"')}<h2 style="min-width:150px;text-align:center">${esc(KB.bulan(st.bln))}</h2>${btn('kal-geser', '', 'chevron_right', 'ghost ico', 'data-n="1" aria-label="Bulan berikutnya"')}
        ${btn('kal-kini', 'Hari ini', '', 'sm')}<span class="sp"></span>
        <div class="seg">${[['semua', 'Semua'], ['cicilan', 'Cicilan'], ['berulang', 'Rutin']].map(o => `<button type="button" class="${st.f === o[0] ? 'on' : ''}" data-act="kal-f" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>
      </div>
      <div class="grid g-84" style="gap:0">
        <div><div class="kal">${cells}</div>
          <div class="card-f wrap"><div class="legend"><span><i class="dot" style="background:var(--red)"></i>Cicilan</span><span><i class="dot" style="background:var(--green)"></i>Pemasukan rutin</span><span><i class="dot" style="background:var(--amber)"></i>Pengeluaran rutin</span><span><i class="dot" style="background:var(--faint)"></i>Lunas</span></div><span class="sp"></span><span class="sub">Cicilan bulan ini ${uang(total)}</span></div></div>
        <div style="border-left:1px solid var(--border)"><div class="card-h"><h2>${esc(KB.tglPanjang(st.pilih))}</h2></div><div class="card-b stack" style="gap:8px">
          ${pilihEv.length ? pilihEv.map(e => e.tipe === 'cicilan' ? itemDue({ pid: e.pid, pihak: e.judul, ke: e.ke, dari: e.dari, tgl: e.tgl, nominal: e.nominal, sisa: e.sisa, lunas: e.lunas, hariLagi: H.selisihHari(m.t, e.tgl) })
            : `<div class="due"><div class="tg" style="color:${e.jenis === 'Pemasukan' ? 'var(--green-d)' : 'var(--amber-d)'}">${ic('event_repeat')}</div><div class="t"><b>${esc(e.judul)}</b><small>${esc(e.kat)} · ${e.jenis} rutin (perkiraan)</small></div>${uang(e.nominal, e.jenis === 'Pemasukan' ? 'plus' : 'minus')}</div>`).join('') : kosong('event_available', 'Tidak ada jadwal', 'Pilih tanggal lain di kalender.')}
        </div></div></div></div>`;
  };

  /* ---------- Riwayat ---------- */
  VIEW.riwayat = function () {
    const st = UI.riw = UI.riw || { q: '', jenis: 'Semua', dari: '', sampai: '', n: 150 };
    const q = st.q.trim().toLowerCase();
    const rows = M().gab.filter(x => (st.jenis === 'Semua' || x.jenis === st.jenis) && (!st.dari || x.tgl >= st.dari) && (!st.sampai || x.tgl <= st.sampai) &&
      (!q || (x.kat + ' ' + x.ket + ' ' + x.nom + ' ' + KB.tgl(x.tgl)).toLowerCase().indexOf(q) > -1));
    let html = '', tg = null;
    rows.slice(0, st.n).forEach(x => {
      if (x.tgl !== tg) { tg = x.tgl; html += `<div class="grp-h">${ic('event', 's16')}<b>${esc(KB.tglPanjang(tg))}</b></div>`; }
      html += rowTx(x, { tanpaTgl: true, label: true });
    });
    const masuk = rows.filter(x => x.jenis === 'Pemasukan').reduce((s, x) => s + x.nom, 0), keluar = rows.filter(x => x.jenis !== 'Pemasukan').reduce((s, x) => s + x.nom, 0);
    return pageH('Analisis', 'Riwayat transaksi', 'Semua pemasukan, pengeluaran, dan pembayaran cicilan dalam satu daftar.', btn('csv-riwayat', 'Ekspor CSV', 'download', '')) +
      `<div class="card"><div class="card-h wrap" style="gap:8px">
        <div class="cari">${ic('search')}<input id="q-riw" class="inp" type="search" placeholder="Cari…" value="${esc(st.q)}" data-filter="riw" data-f="q" autocomplete="off"></div>
        <div class="seg">${['Semua', 'Pemasukan', 'Pengeluaran', 'Cicilan'].map(j => `<button type="button" class="${st.jenis === j ? 'on' : ''}" data-act="riw-jenis" data-v="${j}">${j}</button>`).join('')}</div>
        <input class="inp" type="date" style="width:auto;height:36px" value="${st.dari}" data-filter="riw" data-f="dari" aria-label="Dari tanggal">
        <input class="inp" type="date" style="width:auto;height:36px" value="${st.sampai}" data-filter="riw" data-f="sampai" aria-label="Sampai tanggal">
      </div>
      <div class="card-f" style="border-top:0;border-bottom:1px solid var(--border)"><span class="sub">${rows.length} transaksi · masuk ${uang(masuk, 'plus')} · keluar ${uang(keluar, 'minus')}</span></div>
      <div class="list">${rows.length ? html : kosong('history', 'Tidak ada transaksi', 'Ubah filter atau kata kunci.')}</div>
      ${rows.length > st.n ? `<div class="lebih">${btn('lebih', 'Tampilkan lebih banyak', 'expand_more', 'sm', 'data-st="riw"')}</div>` : ''}</div>`;
  };

  /* ---------- Laporan ---------- */
  function rentangPreset(p, t) {
    const k = H.bk(t);
    if (p === 'bulan') return [k + '-01', k + '-' + String(H.hariAkhir(+k.slice(0, 4), +k.slice(5))).padStart(2, '0')];
    if (p === 'bulanlalu') { const l = H.geserBulan(k, -1); return [l + '-01', l + '-' + String(H.hariAkhir(+l.slice(0, 4), +l.slice(5))).padStart(2, '0')]; }
    if (p === '3bulan') return [H.geserBulan(k, -2) + '-01', t];
    if (p === 'tahun') return [t.slice(0, 4) + '-01-01', t.slice(0, 4) + '-12-31'];
    return ['', ''];
  }
  VIEW.laporan = function () {
    const m = M(), st = UI.lap = UI.lap || (() => { const r = rentangPreset('bulan', m.t); return { periode: 'harian', preset: 'bulan', dari: r[0], sampai: r[1], jenis: 'Semua', kat: '', q: '', rinci: false }; })();
    const L = H.laporan(S.data, { dari: st.dari, sampai: st.sampai, periode: st.periode, jenis: st.jenis, kat: st.kat, cari: st.q });
    UI.lapHasil = L;
    const kats = Array.from(new Set(M().gab.map(x => x.kat))).sort((a, b) => a.localeCompare(b));
    const labelP = (k) => st.periode === 'harian' ? KB.tgl(k) : st.periode === 'mingguan' ? 'Minggu ' + KB.tglPendek(k) : st.periode === 'tahunan' ? k : KB.bulan(k);
    const maxK = L.kategori.length ? L.kategori[0].total : 1;
    return `<div class="cetak-only" style="margin-bottom:12px"><h1>${esc(S.data.set.nama_app)} — Laporan Keuangan</h1><p>${esc(st.dari ? KB.tgl(st.dari) : 'Awal')} s.d. ${esc(st.sampai ? KB.tgl(st.sampai) : 'Akhir')} · dicetak ${esc(KB.tglPanjang(m.t))}</p></div>` +
      pageH('Analisis', 'Laporan', 'Rekap harian, mingguan, bulanan, atau tahunan. Ekspor CSV atau cetak/simpan sebagai PDF.', btn('csv-laporan', 'CSV', 'download', '') + btn('cetak', 'Cetak / PDF', 'print', 'pri')) +
      `<div class="card noprint"><div class="card-b stack" style="gap:10px">
        <div class="row wrap"><div class="seg">${[['harian', 'Harian'], ['mingguan', 'Mingguan'], ['bulanan', 'Bulanan'], ['tahunan', 'Tahunan']].map(o => `<button type="button" class="${st.periode === o[0] ? 'on' : ''}" data-act="lap-periode" data-v="${o[0]}">${o[1]}</button>`).join('')}</div><span class="sp"></span>
          <div class="chips">${[['bulan', 'Bulan ini'], ['bulanlalu', 'Bulan lalu'], ['3bulan', '3 bulan'], ['tahun', 'Tahun ini'], ['semua', 'Semua']].map(o => `<button type="button" class="chip ${st.preset === o[0] ? 'on' : ''}" data-act="lap-preset" data-v="${o[0]}">${o[1]}</button>`).join('')}</div></div>
        <div class="row wrap">
          <input class="inp" type="date" style="width:auto" value="${st.dari}" data-filter="lap" data-f="dari" aria-label="Dari tanggal"><span class="muted">s.d.</span>
          <input class="inp" type="date" style="width:auto" value="${st.sampai}" data-filter="lap" data-f="sampai" aria-label="Sampai tanggal">
          <select class="inp" style="width:auto" data-filter="lap" data-f="jenis" aria-label="Jenis">${['Semua', 'Pemasukan', 'Pengeluaran', 'Cicilan'].map(j => `<option ${st.jenis === j ? 'selected' : ''}>${j}</option>`).join('')}</select>
          <select class="inp" style="width:auto;max-width:220px" data-filter="lap" data-f="kat" aria-label="Kategori"><option value="">Semua kategori</option>${kats.map(k => `<option ${sama(k, st.kat) ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>
          <div class="cari">${ic('search')}<input id="q-lap" class="inp" type="search" placeholder="Cari…" value="${esc(st.q)}" data-filter="lap" data-f="q"></div>
        </div></div></div>
      <div class="grid g4 mt16">
        ${metric('Total pemasukan', `<span class="plus">${uang(L.total.pemasukan)}</span>`, '', 'south_west', 'var(--green-d)')}
        ${metric('Pengeluaran + cicilan', `<span class="minus">${uang(L.total.pengeluaran + L.total.cicilan)}</span>`, 'cicilan ' + uang(L.total.cicilan), 'north_east', 'var(--red-d)')}
        ${metric('Arus kas bersih', `<span class="${L.total.bersih >= 0 ? 'plus' : 'minus'}">${uang(L.total.bersih)}</span>`, '', 'balance')}
        ${metric('Jumlah transaksi', `<span class="num">${L.total.jumlah}</span>`, L.grup.length + ' periode', 'tag')}
      </div>
      <div class="grid g-73 mt16">
        <div class="card"><div class="card-h"><h2>Rekap ${st.periode}</h2></div><div class="tbl-w"><table class="tbl"><thead><tr><th>Periode</th><th class="r">Pemasukan</th><th class="r">Pengeluaran</th><th class="r">Cicilan</th><th class="r">Bersih</th><th class="r">Trx</th></tr></thead><tbody>
          ${L.grup.length ? L.grup.map(g => `<tr><td>${esc(labelP(g.kunci))}</td><td class="r plus">${uang(g.pemasukan)}</td><td class="r minus">${uang(g.pengeluaran)}</td><td class="r">${uang(g.cicilan)}</td><td class="r"><b class="${g.bersih < 0 ? 'minus' : 'plus'}">${uang(g.bersih)}</b></td><td class="r mono">${g.jumlah}</td></tr>`).join('') : `<tr><td colspan="6">${kosong('summarize', 'Tidak ada data pada rentang ini')}</td></tr>`}
          </tbody></table></div></div>
        <div class="card"><div class="card-h"><h2>Per kategori</h2></div><div class="card-b">${L.kategori.length ? `<div class="bars">${L.kategori.slice(0, 12).map(k => { const mt = katMeta(k.jenis, k.kat); return `<div class="bar-r"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(k.kat)}">${esc(k.kat)}</span><span class="b"><i style="width:${Math.max(2, Math.round(k.total / maxK * 100))}%;background:${mt.warna}"></i></span>${uang(k.total, k.jenis === 'Pemasukan' ? 'plus' : 'minus')}</div>`; }).join('')}</div>` : kosong('category', 'Belum ada data')}</div></div>
      </div>
      <div class="card mt16"><div class="card-h"><h2>Laporan rinci</h2><span class="sub">${L.rows.length} baris</span><span class="sp"></span>${btn('lap-rinci', st.rinci ? 'Sembunyikan' : 'Tampilkan', st.rinci ? 'expand_less' : 'expand_more', 'ghost sm noprint')}</div>
        ${st.rinci ? `<div class="tbl-w"><table class="tbl"><thead><tr><th>Tanggal</th><th>Jenis</th><th>Kategori</th><th>Keterangan</th><th class="r">Nominal</th></tr></thead><tbody>${L.rows.map(x => `<tr><td>${esc(KB.tgl(x.tgl))}</td><td>${esc(x.jenis)}</td><td>${esc(x.kat)}</td><td style="white-space:normal;min-width:180px">${esc(x.ket)}</td><td class="r ${x.jenis === 'Pemasukan' ? 'plus' : 'minus'}">${uang(x.nom, '', x.jenis === 'Pemasukan' ? '+' : '-')}</td></tr>`).join('')}</tbody></table></div>` : ''}</div>`;
  };

  /* ---------- Proyeksi ---------- */
  VIEW.proyeksi = function () {
    const m = M(), p = m.proy, terendah = p.reduce((a, r) => r.saldoAkhir < a.saldoAkhir ? r : a, p[0]);
    const adaBerulang = S.data.berulang.some(b => b.aktif);
    return pageH('Analisis', 'Proyeksi saldo 36 bulan', 'Saldo kas hari ini, ditambah transaksi bertanggal ke depan dan transaksi berulang, dikurangi cicilan yang belum dibayar.', btn('csv-proyeksi', 'Ekspor CSV', 'download', '')) +
      (adaBerulang ? '' : `<div class="note warn mb12">${ic('lightbulb')}<div>Belum ada <b>transaksi berulang</b>. Tanpa itu, bulan-bulan berikutnya hanya memuat cicilan dan transaksi yang sudah dicatat bertanggal ke depan. <a href="#/berulang">Tambah gaji atau sewa</a>.</div></div>`) +
      `<div class="grid g4">
        ${metric('Saldo kas hari ini', uang(m.saldo), 'transaksi s.d. ' + KB.tglPendek(m.t), 'account_balance_wallet', '', 'hero')}
        ${metric('Akhir ' + KB.bulanPendek(p[0].bulan), `<span class="${p[0].saldoAkhir < 0 ? 'minus' : ''}">${uang(p[0].saldoAkhir)}</span>`, p[0].tunggakan ? 'termasuk tunggakan ' + KB.rp(p[0].tunggakan) : 'setelah cicilan bulan ini', 'event')}
        ${metric('Akhir ' + KB.bulanPendek(p[11].bulan), `<span class="${p[11].saldoAkhir < 0 ? 'minus' : ''}">${uang(p[11].saldoAkhir)}</span>`, '12 bulan', 'date_range')}
        ${metric('Titik terendah', `<span class="${terendah.saldoAkhir < 0 ? 'minus' : ''}">${uang(terendah.saldoAkhir)}</span>`, esc(KB.bulan(terendah.bulan)), 'trending_down', terendah.saldoAkhir < 0 ? 'var(--red-d)' : 'var(--amber-d)')}
      </div>
      <div class="card mt16"><div class="card-h">${ic('show_chart', 's18')}<h2>Tren saldo akhir bulan</h2><span class="sp"></span><span class="sub">${esc(KB.bulanPendek(p[0].bulan))} – ${esc(KB.bulanPendek(p[35].bulan))}</span></div><div class="card-b">${grafikGaris(p)}</div></div>
      <div class="card mt16"><div class="card-h"><h2>Rincian per bulan</h2></div><div class="tbl-w" style="max-height:560px;overflow:auto"><table class="tbl"><thead><tr><th>#</th><th>Bulan</th><th class="r">Saldo awal</th><th class="r">Pemasukan</th><th class="r">Pengeluaran</th><th class="r">Cicilan</th><th class="r">Saldo akhir</th></tr></thead><tbody>
        ${p.map((r, i) => `<tr class="${r.berjalan ? 'sorot' : ''}"><td class="mono faint">${i + 1}</td><td>${esc(KB.bulan(r.bulan))}${r.berjalan ? ' <span class="pill info">Berjalan</span>' : ''}</td><td class="r">${uang(r.saldoAwal)}</td><td class="r plus" title="${r.berulangMasuk ? 'termasuk berulang ' + KB.rp(r.berulangMasuk) : ''}">${uang(r.pemasukan)}</td><td class="r minus" title="${r.berulangKeluar ? 'termasuk berulang ' + KB.rp(r.berulangKeluar) : ''}">${uang(r.pengeluaran)}</td><td class="r">${uang(r.cicilan)}</td><td class="r"><b class="${r.saldoAkhir < 0 ? 'minus' : ''}">${uang(r.saldoAkhir)}</b></td></tr>`).join('')}
      </tbody></table></div></div>`;
  };

  /* ---------- Pengaturan ---------- */
  VIEW.pengaturan = function () {
    const st = UI.set = UI.set || { tipe: 'Pengeluaran', info: null, cadangan: null, mig: { sumber: '', tabel: ['kategori', 'pemasukan', 'pengeluaran', 'pinjaman', 'bayar', 'berulang'], timpa: false, pengaturan: true, hasil: null, sibuk: false } };
    const set = S.data.set, base = location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, ''), publikUrl = base, info = st.info;
    const kats = S.data.kategori.filter(k => k.tipe === st.tipe).sort((a, b) => a.nama.localeCompare(b.nama));
    const mig = st.mig, cad = st.cadangan;
    const TBL = [['kategori', 'Kategori'], ['pemasukan', 'Pemasukan'], ['pengeluaran', 'Pengeluaran'], ['pinjaman', 'Pinjaman (Hutang)'], ['bayar', 'Pembayaran cicilan'], ['berulang', 'Berulang']];
    return pageH('Sistem', 'Pengaturan', 'Keamanan akses, halaman publik, kategori, tampilan, cadangan, dan migrasi data.') +
      `<div class="grid g2" style="align-items:start"><div class="stack">
        <div class="card"><div class="card-h">${ic('shield_lock', 's18')}<h2>Keamanan akses</h2><span class="sp"></span><span class="pill ok">${ic('verified', 's16')}Google OAuth</span></div>
          <div class="set-row"><div class="t"><b>Super Admin</b><small>${esc(S.sesi ? S.sesi.email : '')}</small></div></div>
          <div class="set-row"><div class="t"><b>Alamat rahasia dashboard</b><small class="mono">${info ? esc(info.kunciSamar) : 'admin.html?k=••••••'}</small></div>${btn('kunci-ganti', 'Buat baru', 'key', 'sm')}</div>
          ${st.kunciBaru ? `<div class="card-b" style="border-bottom:1px solid var(--border)"><div class="note warn">${ic('warning')}<div><b>Simpan alamat baru ini sekarang.</b> Alamat lama sudah tidak berlaku dan alamat ini hanya ditampilkan sekali.</div></div><div class="kode mt8">${esc(base + 'admin.html?k=' + st.kunciBaru)}</div><div class="row mt8">${btn('salin', 'Salin', 'content_copy', 'sm', `data-teks="${esc(base + 'admin.html?k=' + st.kunciBaru)}"`)}</div></div>` : ''}
          <div class="set-row"><div class="t"><b>Cabut semua sesi</b><small>Keluarkan semua perangkat yang sedang masuk.</small></div>${btn('cabut-sesi', 'Cabut', 'devices', 'sm')}</div>
          <div class="set-row"><div class="t"><b>Keluar</b><small>Data di perangkat ini dihapus.</small></div>${btn('keluar', 'Keluar', 'logout', 'danger sm')}</div></div>

        <div class="card"><div class="card-h">${ic('public', 's18')}<h2>Halaman publik</h2><span class="sp"></span><label class="switch"><input type="checkbox" data-act="publik-aktif" ${set.publik_aktif !== 'off' ? 'checked' : ''} aria-label="Halaman publik aktif"><span></span></label></div>
          <div class="card-b stack" style="gap:10px"><p class="sub">Tanpa login, siapa pun yang tahu alamatnya dapat melihat bagian yang Anda nyalakan di bawah. Bagian yang dimatikan tidak dikirim ke pengunjung sama sekali. Berlaku di semua perangkat.</p>
          <div class="kode">${esc(publikUrl)}</div><div class="row">${btn('salin', 'Salin', 'content_copy', 'sm', `data-teks="${esc(publikUrl)}"`)}<a class="btn sm" href="./" target="_blank" rel="noopener">${ic('open_in_new')}Buka</a></div></div>
          <div class="card-h" style="border-top:1px solid var(--border)">${ic('tune', 's18')}<h2>Bagian yang tampil</h2><span class="sp"></span>${pubSembunyi().length || !pubTampil('keinginan') ? btn('pub-semua', 'Tampilkan semua', 'visibility', 'ghost sm') : ''}</div>
          ${htmlPubAtur()}</div>

        <div class="card"><div class="card-h">${ic('palette', 's18')}<h2>Tampilan</h2></div>
          <form class="card-b stack" data-form="tampilan" style="gap:12px">
            <div class="field"><label for="f-nama">Nama aplikasi</label><input id="f-nama" class="inp" name="nama_app" maxlength="40" value="${esc(set.nama_app)}"></div>
            <div class="field"><label for="f-logo">Logo <small>link Google Drive atau https://</small></label><input id="f-logo" class="inp" name="logo_url" value="${esc(set.logo_url)}" placeholder="Kosongkan untuk logo bawaan"><span class="hint">File Drive harus dibagikan "Siapa saja yang memiliki link".</span></div>
            <div class="row"><button class="btn pri sm">Simpan tampilan</button></div></form>
          <div class="set-row" style="border-top:1px solid var(--border)"><div class="t"><b>Mode gelap</b><small>Hanya di perangkat ini.</small></div><label class="switch"><input type="checkbox" data-act="tema" ${S.tema === 'gelap' ? 'checked' : ''} aria-label="Mode gelap"><span></span></label></div>
          <div class="set-row"><div class="t"><b>Samarkan nominal</b><small>Tombol mata di bilah atas. Arahkan kursor untuk melihat.</small></div><label class="switch"><input type="checkbox" data-act="privasi-set" ${S.privasi ? 'checked' : ''} aria-label="Samarkan nominal"><span></span></label></div></div>

        <div class="card"><div class="card-h">${ic('space_dashboard', 's18')}<h2>Bagian dashboard</h2><span class="sp"></span>${dashSembunyi().length ? btn('dash-semua', 'Tampilkan semua', 'visibility', 'ghost sm') : ''}</div>
          <div class="card-b" style="padding-bottom:4px"><p class="sub">Pilih bagian yang tampil di halaman Dashboard. Bisa juga lewat tombol <b>Atur tampilan</b> di Dashboard. Berlaku di semua perangkat.</p></div>
          ${htmlDashAtur()}</div>

        <div class="card"><div class="card-h">${ic('menu', 's18')}<h2>Menu admin</h2><span class="sp"></span>${menuSembunyi().length ? btn('menu-semua', 'Tampilkan semua', 'visibility', 'ghost sm') : ''}</div>
          <div class="card-b" style="padding-bottom:4px"><p class="sub">Sembunyikan menu yang jarang dipakai dari menu samping, navigasi bawah, dan daftar Menu. Data tidak dihapus dan tetap dihitung. Berlaku di semua perangkat.</p></div>
          ${MENU.map(g => g[1].map(m => {
            const tetap = MENU_TETAP.indexOf(m[0]) > -1, on = tetap || menuTampil(m[0]);
            return `<div class="set-row menu-row ${on ? '' : 'mati'}"><div class="t"><b>${ic(m[2], 's18')}${m[1]}</b><small>${g[0]}${tetap ? ' · selalu tampil' : on ? '' : ' · disembunyikan'}</small></div>
              <label class="switch"><input type="checkbox" data-act="menu-tampil" data-menu="${m[0]}" ${on ? 'checked' : ''} ${tetap ? 'disabled' : ''} aria-label="Tampilkan menu ${m[1]}"><span></span></label></div>`;
          }).join('')).join('')}</div>

        <div class="card"><div class="card-h">${ic('install_mobile', 's18')}<h2>Aplikasi</h2></div>
          <div class="set-row"><div class="t"><b>Pasang di HP / laptop</b><small>${KB.mandiri() ? 'Sudah berjalan sebagai aplikasi.' : KB.pasang.siap ? 'Buka seperti aplikasi, tanpa bilah alamat.' : KB.ios() ? 'Safari: ketuk Bagikan → Tambahkan ke Layar Utama.' : 'Gunakan menu browser → Instal aplikasi.'}</small></div>${KB.pasang.siap ? btn('pasang', 'Pasang', 'download', 'pri sm') : ''}</div>
          <div class="set-row"><div class="t"><b>Segarkan dari Google Sheets</b><small>Pakai setelah mengedit spreadsheet secara langsung. ${S.sinkronT ? 'Terakhir diperiksa ' + KB.jamLalu(new Date(S.sinkronT).toISOString()) : ''} · versi data ${S.ver}${S.ob.length ? ' · ' + S.ob.length + ' antre' : ''}</small></div>${btn('sinkron-penuh', 'Segarkan', 'refresh', 'sm')}</div>
          <div class="set-row"><div class="t"><b>Versi</b><small data-versi>Frontend ${KB.VERSI} · Backend ${KB.vServer ? esc(KB.vServer) : 'belum diketahui'}</small></div>${backendLama() ? `<span class="pill bad">${ic('warning', 's16')}Backend perlu diperbarui</span>` : ''}</div></div>
      </div><div class="stack">
        <div class="card"><div class="card-h">${ic('category', 's18')}<h2>Kategori</h2><span class="sp"></span><div class="seg">${['Pengeluaran', 'Pemasukan'].map(t => `<button type="button" class="${st.tipe === t ? 'on' : ''}" data-act="set-tipe" data-v="${t}">${t}</button>`).join('')}</div></div>
          <div class="card-b"><div class="kat-grid">${kats.map(k => `<button type="button" class="kat-it" data-act="ubah-kategori" data-id="${esc(k.id)}"><span class="k" style="background:${k.warna}1f;color:${k.warna}">${ic(k.ikon)}</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(k.nama)}</span></button>`).join('')}
            <button type="button" class="kat-it" data-act="kategori-baru" data-tipe="${st.tipe}" style="border-style:dashed;color:var(--teal-d)"><span class="k" style="background:var(--teal-bg)">${ic('add')}</span>Kategori baru</button></div></div></div>

        <div class="card"><div class="card-h">${ic('backup', 's18')}<h2>Cadangan & kalender</h2></div>
          <div class="set-row"><div class="t"><b>Cadangkan sekarang</b><small>Salinan spreadsheet ke folder Drive "Kas Bandhits Backups".</small></div>${btn('cadangan-buat', 'Cadangkan', 'cloud_upload', 'sm')}</div>
          <div class="set-row"><div class="t"><b>Cadangan otomatis bulanan</b><small>${cad ? (cad.terjadwal ? 'Aktif · tiap tanggal 1 pukul 02.00' : 'Nonaktif') : 'Memuat…'}</small></div>${cad ? `<label class="switch"><input type="checkbox" data-act="cadangan-jadwal" ${cad.terjadwal ? 'checked' : ''} aria-label="Cadangan otomatis"><span></span></label>` : ''}</div>
          ${cad && cad.daftar.length ? `<div class="list">${cad.daftar.map(f => `<a class="trow" href="${esc(f.url)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${ic('description')}<div class="t"><b>${esc(f.nama)}</b><small>${esc(new Date(f.t).toLocaleString('id-ID'))}</small></div>${ic('open_in_new', 's18')}</a>`).join('')}</div>` : ''}
          <div class="set-row" style="border-top:1px solid var(--border)"><div class="t"><b>Google Calendar</b><small>Tambahkan cicilan berikutnya setiap pinjaman sebagai acara dengan pengingat.</small></div>${btn('kalender-sinkron', 'Sinkron', 'event', 'sm')}</div></div>

        <div class="card"><div class="card-h">${ic('move_up', 's18')}<h2>Migrasi dari Bandhits lama</h2></div>
          <form class="card-b stack" data-form="migrasi" style="gap:12px">
            <div class="note">${ic('lock')}<div>Spreadsheet lama <b>hanya dibaca</b>, tidak ada yang diubah. Aman diulang: data yang sudah ada tidak digandakan. Jalankan sekali lagi tepat sebelum pindah untuk menangkap data terbaru.</div></div>
            <div class="field"><label for="f-sumber">URL atau ID spreadsheet lama</label><input id="f-sumber" class="inp" name="sumber" value="${esc(mig.sumber)}" placeholder="https://docs.google.com/spreadsheets/d/…" required autocomplete="off"><span class="hint">Harus milik akun Google yang sama dengan Apps Script ini.</span></div>
            <div class="field"><span class="flabel">Data yang diimpor</span><div class="chips">${TBL.map(t => `<label class="chip ${mig.tabel.indexOf(t[0]) > -1 ? 'on' : ''}"><input type="checkbox" name="tabel" value="${t[0]}" ${mig.tabel.indexOf(t[0]) > -1 ? 'checked' : ''} hidden data-act="chip-cek">${t[1]}</label>`).join('')}</div></div>
            <label class="row"><input type="checkbox" name="pengaturan" ${mig.pengaturan ? 'checked' : ''}> <span>Pakai logo dari app lama (bila logo di sini masih kosong)</span></label>
            <label class="row"><input type="checkbox" name="timpa" ${mig.timpa ? 'checked' : ''}> <span>Timpa data yang ID-nya sudah ada <small class="muted">(biasanya tidak perlu)</small></span></label>
            <div class="row wrap"><button type="submit" class="btn" name="mode" value="pindai" ${mig.sibuk ? 'disabled' : ''}>${ic('search')}Pindai (tanpa menulis)</button><button type="submit" class="btn pri" name="mode" value="jalankan" ${mig.sibuk ? 'disabled' : ''}>${ic('play_arrow')}Jalankan impor</button>${mig.sibuk ? '<span class="sub">Memproses…</span>' : ''}</div>
          </form>
          ${mig.hasil ? `<div class="card-b" style="border-top:1px solid var(--border)"><div class="row mb12"><b>${mig.hasil.dryRun ? 'Hasil pindai' : 'Impor selesai'}</b><span class="sp"></span><span class="pill ${mig.hasil.dryRun ? 'info' : 'ok'}">${esc(mig.hasil.sumber.nama)}</span></div>
            <div class="tbl-w"><table class="tbl"><thead><tr><th>Data</th><th class="r">Di app lama</th><th class="r">${mig.hasil.dryRun ? 'Akan ditambah' : 'Ditambah'}</th><th class="r">Diperbarui</th><th class="r">Dilewati</th></tr></thead><tbody>
            ${Object.keys(mig.hasil.laporan).map(k => { const x = mig.hasil.laporan[k]; return `<tr><td>${esc(k)}${x.catatan ? `<br><small class="muted">${esc(x.catatan)}</small>` : ''}</td><td class="r mono">${x.sumber}</td><td class="r mono plus">${x.ditambah}</td><td class="r mono">${x.diperbarui}</td><td class="r mono muted">${x.dilewati}</td></tr>`; }).join('')}
            </tbody></table></div>
            ${mig.hasil.peringatan.length ? `<div class="note warn mt12">${ic('warning')}<div>${mig.hasil.peringatan.map(esc).join('<br>')}</div></div>` : ''}</div>` : ''}</div>
      </div></div>`;
  };
  AFTER.pengaturan = function () {
    const st = UI.set;
    if (!st.info && !st._muatInfo) { st._muatInfo = 1; panggil('kunci.info').then(j => { st.info = j.r; if (UI.view === 'pengaturan') renderRingan(); }).catch(() => { }).finally(() => { st._muatInfo = 0; }); }
    if (!st.cadangan && !st._muatCad) { st._muatCad = 1; panggil('backup.daftar').then(j => { st.cadangan = j.r; if (UI.view === 'pengaturan') renderRingan(); }).catch(() => { }).finally(() => { st._muatCad = 0; }); }
  };

  /* ===================== LACI (drawer) & DIALOG ===================== */
  let _laci = null, _kembaliFokus = null;
  function bukaDrawer(html, lebar) {
    tutupDrawer(true);
    _kembaliFokus = document.activeElement;
    const bd = document.createElement('div'); bd.className = 'backdrop'; bd.dataset.act = 'tutup';
    const dr = document.createElement('div'); dr.className = 'drawer' + (lebar ? ' lebar' : ''); dr.setAttribute('role', 'dialog'); dr.setAttribute('aria-modal', 'true');
    dr.innerHTML = html;
    document.body.appendChild(bd); document.body.appendChild(dr);
    _laci = { bd, dr };
    requestAnimationFrame(() => { bd.classList.add('on'); dr.classList.add('on'); });
    const f = dr.querySelector('[autofocus]') || dr.querySelector('input:not([type=hidden]),select,textarea,button');
    setTimeout(() => { if (f && window.matchMedia('(min-width: 768px)').matches) f.focus(); else if (f && f.hasAttribute('autofocus')) f.focus(); }, 60);
    return dr;
  }
  function tutupDrawer(langsung) {
    if (!_laci) return;
    const l = _laci; _laci = null;
    l.bd.classList.remove('on'); l.dr.classList.remove('on');
    const hapus = () => { l.bd.remove(); l.dr.remove(); };
    if (langsung) hapus(); else setTimeout(hapus, 220);
    if (_kembaliFokus && _kembaliFokus.focus && document.contains(_kembaliFokus)) try { _kembaliFokus.focus({ preventScroll: true }); } catch (e) { }
    renderRingan();
  }
  const kepala = (judul, sub) => `<div class="dh"><div style="flex:1;min-width:0"><h2>${judul}</h2>${sub ? `<p>${sub}</p>` : ''}</div><button type="button" class="btn ghost ico" data-act="tutup" aria-label="Tutup">${ic('close')}</button></div>`;
  const kaki = (label, kelas, kiri) => `<div class="df">${kiri || ''}<span class="sp"></span><button type="button" class="btn" data-act="tutup">Batal</button><button type="submit" class="btn ${kelas || 'pri'}">${label}</button></div>`;
  let _konfirm = null;
  function konfirmasi(judul, pesan, tombol, bahaya) {
    return new Promise(selesai => {
      _konfirm = selesai;
      bukaDrawer(`<form data-form="konfirm" style="display:contents">${kepala(esc(judul))}<div class="db"><p>${esc(pesan)}</p></div>${kaki(esc(tombol || 'Ya'), bahaya ? 'danger solid' : 'pri')}</form>`);
    });
  }
  const fieldUang = (nama, nilai, label, auto) => `<div class="field"><label for="f-${nama}">${label}</label><div class="inp-pre"><span>Rp</span><input id="f-${nama}" class="inp uang" name="${nama}" inputmode="numeric" autocomplete="off" value="${nilai ? KB.angka(nilai) : ''}" placeholder="0" ${auto ? 'autofocus' : ''} required></div></div>`;
  function opsiKategori(tipe, nilai) {
    const list = S.data.kategori.filter(k => k.tipe === tipe).sort((a, b) => a.nama.localeCompare(b.nama));
    const ada = !nilai || list.some(k => sama(k.nama, nilai));
    return `<div class="chips" data-kat-chips>${list.map(k => `<button type="button" class="chip ${sama(k.nama, nilai) ? 'on' : ''}" data-act="pilih-kat" data-v="${esc(k.nama)}"><span class="ic s16" style="color:${k.warna}">${k.ikon}</span>${esc(k.nama)}</button>`).join('')}
      <button type="button" class="chip ${!ada ? 'on' : ''}" data-act="pilih-kat" data-v="__baru">${ic('add', 's16')}Kategori baru</button></div>
      <input type="hidden" name="kat" value="${esc(ada ? nilai : '__baru')}">
      <input class="inp mt8" name="katBaru" placeholder="Nama kategori baru" maxlength="60" value="${esc(ada ? '' : nilai)}" ${ada ? 'hidden' : ''} autocomplete="off">`;
  }

  /* ---------- Form transaksi ---------- */
  function formTx(jenis, rec) {
    const tabel = TABEL_JENIS[jenis], baru = !rec, id = rec ? rec.id : uid(AWALAN[tabel]);
    bukaDrawer(`<form data-form="tx" data-jenis="${jenis}" data-id="${esc(id)}" data-baru="${baru ? 1 : 0}" style="display:contents" novalidate>
      ${kepala((baru ? 'Catat ' : 'Ubah ') + jenis.toLowerCase(), `<span class="idk">ID ${esc(id)}</span>`)}
      <div class="db">
        ${fieldUang('nom', rec && rec.nom, 'Nominal', baru)}
        <div class="field"><span class="flabel">Kategori</span>${opsiKategori(jenis, rec ? rec.kat : '')}</div>
        <div class="field"><label for="f-tgl">Tanggal</label><input id="f-tgl" class="inp" type="date" name="tgl" value="${rec ? rec.tgl : KB.hariIni()}" required></div>
        <div class="field"><label for="f-ket">Keterangan <small>opsional</small></label><textarea id="f-ket" class="inp" name="ket" maxlength="300" placeholder="${jenis === 'Pemasukan' ? 'Contoh: Gaji November' : 'Contoh: Makan siang bersama tim'}">${esc(rec ? rec.ket : '')}</textarea></div>
        ${jenis === 'Pemasukan' && baru ? `<div class="note">${ic('info')}<div>Dana pinjaman tunai yang cair ke rekening? Catat di sini dengan kategori <b>Pinjaman Cair</b>.</div></div>` : ''}
        <p class="err" data-err hidden></p>
      </div>${kaki(baru ? 'Simpan' : 'Simpan perubahan')}</form>`);
  }
  const _terakhir = [];
  function cekKembar(kunci) {
    const t = Date.now(); while (_terakhir.length && t - _terakhir[0].t > 10000) _terakhir.shift();
    return _terakhir.some(x => x.k === kunci);
  }
  function errForm(f, pesan) { const e = f.querySelector('[data-err]'); if (e) { e.textContent = pesan; e.hidden = false; } }
  function ambilKat(f) { const v = f.kat.value; return v === '__baru' ? f.katBaru.value.trim() : v; }
  function pastikanKategori(tipe, nama) {
    if (!nama || S.data.kategori.some(k => k.tipe === tipe && sama(k.nama, nama))) return;
    antre({ act: 'simpan', tabel: 'kategori', baru: true, rec: { id: uid('KAT'), tipe, nama, ikon: 'sell', warna: '#667085' } });
  }
  const FORM = {};
  FORM.tx = function (f) {
    const jenis = f.dataset.jenis, tabel = TABEL_JENIS[jenis], baru = f.dataset.baru === '1';
    const rec = { id: f.dataset.id, tgl: f.tgl.value, kat: ambilKat(f), ket: f.ket.value.trim(), nom: angkaDari(f.nom.value) };
    if (!(rec.nom > 0)) return errForm(f, 'Isi nominal lebih dari 0.');
    if (!rec.kat) return errForm(f, 'Pilih atau ketik kategori.');
    if (!H.tglValid(rec.tgl)) return errForm(f, 'Tanggal tidak valid.');
    const kunci = [tabel, rec.tgl, rec.kat.toLowerCase(), rec.nom, rec.ket].join('|');
    const lanjut = () => {
      _terakhir.push({ k: kunci, t: Date.now() });
      pastikanKategori(jenis, rec.kat);
      antre({ act: 'simpan', tabel, rec, baru, cid: baru ? rec.id : uid('OP') });
      tutupDrawer();
      KB.toast(jenis + (baru ? ' dicatat.' : ' diperbarui.'));
    };
    if (baru && cekKembar(kunci)) {
      tutupDrawer(true);
      return konfirmasi('Data yang sama baru saja dicatat', `${jenis} ${KB.rp(rec.nom)} (${rec.kat}) sudah dicatat kurang dari 10 detik lalu. Catat lagi sebagai transaksi kedua?`, 'Ya, catat lagi').then(ok => { tutupDrawer(true); if (ok) lanjut(); });
    }
    lanjut();
  };

  /* ---------- Form pinjaman ---------- */
  function formPinjaman(rec) {
    const baru = !rec, id = rec ? rec.id : uid('DT'), t = KB.hariIni();
    const tempo = rec ? rec.tempo : H.tambahBulan(t, 1);
    bukaDrawer(`<form data-form="pinjaman" data-live="pinjaman" data-id="${esc(id)}" data-baru="${baru ? 1 : 0}" style="display:contents" novalidate>
      ${kepala(baru ? 'Tambah pinjaman' : 'Ubah pinjaman', `<span class="idk">ID ${esc(id)}</span>`)}
      <div class="db">
        <div class="note">${ic('account_balance_wallet')}<div>Bila dana pinjaman masuk ke rekening Anda, catat juga sebagai <b>Pemasukan</b>. Form ini hanya mencatat kewajiban cicilan.</div></div>
        <div class="field"><label for="f-pihak">Nama pihak / kreditur</label><input id="f-pihak" class="inp" name="pihak" maxlength="80" value="${esc(rec ? rec.pihak : '')}" placeholder="Contoh: Bank Mandiri KTA" ${baru ? 'autofocus' : ''} required autocomplete="off"></div>
        ${fieldUang('nom', rec && rec.nom, 'Total kewajiban (sesuai kontrak, tanpa bunga)')}
        <div class="field"><label for="f-jangka">Jangka waktu <small data-jangka-lbl></small></label>
          <div class="row"><input id="f-jangka" class="inp mono" type="number" name="jangka" min="1" max="360" value="${rec ? rec.jangka : 12}" style="width:96px;text-align:center" required><span class="muted">bulan</span></div>
          <div class="chips">${[3, 6, 10, 12, 18, 24, 36].map(n => `<button type="button" class="chip" data-act="set-jangka" data-v="${n}">${n} bln</button>`).join('')}</div></div>
        <div class="f2"><div class="field"><label for="f-tempo">Jatuh tempo cicilan pertama</label><input id="f-tempo" class="inp" type="date" name="tempo" value="${tempo}" required></div>
          <div class="field"><label for="f-tgl">Tanggal pencatatan</label><input id="f-tgl" class="inp" type="date" name="tgl" value="${rec ? rec.tgl : t}" required></div></div>
        <div class="field"><label for="f-ket">Keterangan <small>opsional, mis. no. kontrak</small></label><input id="f-ket" class="inp" name="ket" maxlength="300" value="${esc(rec ? rec.ket : '')}" autocomplete="off"></div>
        <div class="sim" data-sim></div>
        <p class="err" data-err hidden></p>
      </div>${kaki(baru ? 'Simpan pinjaman' : 'Simpan perubahan')}</form>`);
    LIVE.pinjaman($('form[data-form="pinjaman"]'));
  }
  const LIVE = {};
  LIVE.pinjaman = function (f) {
    const nom = angkaDari(f.nom.value), n = Math.max(1, Math.floor(Number(f.jangka.value)) || 1), tempo = H.tglValid(f.tempo.value) ? f.tempo.value : KB.hariIni();
    const j = H.jadwalPinjaman({ id: 'x', tgl: tempo, pihak: '', nom, tempo, jangka: n }, [], KB.hariIni());
    const hari = +tempo.slice(8, 10);
    f.querySelector('[data-jangka-lbl]').textContent = n >= 12 ? (n / 12).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' tahun' : '';
    f.querySelector('[data-sim]').innerHTML = `<div class="row">${ic('calculate', 's18')}<b>Simulasi jadwal</b></div>
      <div class="r2"><div class="bx"><span class="lbl">Cicilan 1–${Math.max(1, n - 1)}</span><b>${KB.rp(j.cicilanPerBulan)}</b></div><div class="bx"><span class="lbl">Cicilan ke-${n}</span><b>${KB.rp(j.cicilanTerakhir)}</b></div></div>
      <div class="row"><span class="sub">Cicilan terakhir</span><span class="sp"></span><b>${esc(KB.tgl(j.tglLunas))}</b></div>
      <span class="hint">Pembulatan ke bawah; sisa pembulatan masuk cicilan terakhir.${hari > 28 ? ' Jatuh tempo tgl ' + hari + ' dijepit ke hari terakhir bulan pendek.' : ''}</span>`;
  };
  FORM.pinjaman = function (f) {
    const baru = f.dataset.baru === '1';
    const rec = { id: f.dataset.id, tgl: f.tgl.value, pihak: f.pihak.value.trim(), ket: f.ket.value.trim(), nom: angkaDari(f.nom.value), tempo: f.tempo.value, jangka: Math.floor(Number(f.jangka.value)) };
    if (!rec.pihak) return errForm(f, 'Isi nama pihak.');
    if (!(rec.nom > 0)) return errForm(f, 'Isi total pinjaman.');
    if (!(rec.jangka >= 1 && rec.jangka <= 360)) return errForm(f, 'Jangka waktu 1–360 bulan.');
    if (!H.tglValid(rec.tempo) || !H.tglValid(rec.tgl)) return errForm(f, 'Tanggal tidak valid.');
    if (!baru) { const j = M().pinjaman.find(x => x.id === rec.id); if (j && rec.nom < j.dibayar) return errForm(f, 'Total tidak boleh di bawah yang sudah dibayar (' + KB.rp(j.dibayar) + ').'); }
    antre({ act: 'simpan', tabel: 'pinjaman', rec, baru, cid: baru ? rec.id : uid('OP') });
    tutupDrawer(); KB.toast(baru ? 'Pinjaman ditambahkan.' : 'Pinjaman diperbarui.');
  };

  /* ---------- Form bayar cicilan ---------- */
  function formBayar(pid) {
    const j = M().pinjaman.find(x => x.id === pid);
    if (!j) return KB.toast('Pinjaman tidak ditemukan.', 'bad');
    if (!j.berikut) return KB.toast('Pinjaman ini sudah lunas.');
    const id = uid('PH'), b = j.berikut;
    bukaDrawer(`<form data-form="bayar" data-live="bayar" data-id="${esc(id)}" data-pid="${esc(pid)}" style="display:contents" novalidate>
      ${kepala('Bayar cicilan', esc(j.pihak) + ` · <span class="idk">ID ${esc(id)}</span>`)}
      <div class="db">
        <div class="sim"><div class="r2"><div class="bx"><span class="lbl">Cicilan ke-${b.ke} · ${esc(KB.tglPendek(b.tgl))}</span><b>${KB.rp(b.sisa)}</b></div><div class="bx"><span class="lbl">Sisa pinjaman</span><b>${KB.rp(j.sisa)}</b></div></div>
          ${b.terbayar ? `<span class="hint">Cicilan ke-${b.ke} sudah dibayar sebagian ${KB.rp(b.terbayar)}.</span>` : ''}</div>
        ${fieldUang('nom', b.sisa, 'Nominal dibayar', true)}
        <div class="chips"><button type="button" class="chip" data-act="isi-nom" data-v="${b.sisa}">Cicilan ke-${b.ke} · ${KB.rp(b.sisa)}</button>
          <button type="button" class="chip" data-act="isi-nom" data-v="${j.sisa}">${ic('done_all', 's16')}Lunasi sisa · ${KB.rp(j.sisa)}</button></div>
        <div class="field"><label for="f-tgl">Tanggal bayar</label><input id="f-tgl" class="inp" type="date" name="tgl" value="${KB.hariIni()}" required></div>
        <div class="field"><label for="f-ket">Keterangan <small>opsional</small></label><input id="f-ket" class="inp" name="ket" maxlength="300" autocomplete="off"></div>
        <div class="note" data-sim></div>
        <p class="err" data-err hidden></p>
      </div>${kaki('Catat pembayaran')}</form>`);
    LIVE.bayar($('form[data-form="bayar"]'));
  }
  LIVE.bayar = function (f) {
    const j = M().pinjaman.find(x => x.id === f.dataset.pid), nom = angkaDari(f.nom.value), el = f.querySelector('[data-sim]');
    if (!j) return;
    if (nom > j.sisa) { el.className = 'note bad'; el.innerHTML = ic('error') + `<div>Melebihi sisa pinjaman ${KB.rp(j.sisa)}.</div>`; return; }
    if (!nom) { el.className = 'note'; el.innerHTML = ic('info') + '<div>Isi nominal yang dibayar.</div>'; return; }
    const p = cari(S.data.pinjaman, j.id), bayar = S.data.bayar.filter(x => x.pid === j.id).concat([{ id: 'PH-1-1', tgl: f.tgl.value || KB.hariIni(), nom }]);
    const s = H.jadwalPinjaman(p, bayar, KB.hariIni());
    el.className = 'note'; el.innerHTML = ic('insights') + `<div>${s.status === 'Lunas' ? '<b>Pinjaman lunas.</b>' : `Setelah ini <b>${s.lunasKe}/${s.jangka}</b> cicilan lunas. Berikutnya cicilan ke-${s.berikut.ke} <b>${KB.rp(s.berikut.sisa)}</b> pada ${esc(KB.tgl(s.berikut.tgl))}.`}</div>`;
  };
  FORM.bayar = function (f) {
    const j = M().pinjaman.find(x => x.id === f.dataset.pid);
    const rec = { id: f.dataset.id, pid: f.dataset.pid, tgl: f.tgl.value, ket: f.ket.value.trim(), nom: angkaDari(f.nom.value) };
    if (!(rec.nom > 0)) return errForm(f, 'Isi nominal.');
    if (j && rec.nom > j.sisa) return errForm(f, 'Melebihi sisa pinjaman ' + KB.rp(j.sisa) + '.');
    if (!H.tglValid(rec.tgl)) return errForm(f, 'Tanggal tidak valid.');
    antre({ act: 'simpan', tabel: 'bayar', rec, baru: true, cid: rec.id });
    tutupDrawer(); KB.toast('Pembayaran ' + KB.rp(rec.nom) + ' dicatat.');
  };
  function pilihPinjaman() {
    const aktif = M().pinjaman.filter(j => j.status !== 'Lunas');
    if (!aktif.length) return KB.toast('Tidak ada pinjaman aktif.');
    if (aktif.length === 1) return formBayar(aktif[0].id);
    bukaDrawer(`${kepala('Pilih pinjaman')}<div class="db" style="gap:8px">${aktif.map(j => `<button type="button" class="due" data-act="bayar" data-pid="${esc(j.id)}" style="cursor:pointer;text-align:left;width:100%;font:inherit;color:inherit">
      <div class="tg"><b>${j.berikut ? +j.berikut.tgl.slice(8) : '-'}</b><small>${j.berikut ? KB.BLN[+j.berikut.tgl.slice(5, 7) - 1] : ''}</small></div><div class="t"><b>${esc(j.pihak)}</b><small>Cicilan ${j.berikut.ke}/${j.jangka}</small></div>${uang(j.berikut.sisa)}</button>`).join('')}</div>`);
  }

  /* ---------- Form berulang ---------- */
  function formBerulang(rec, isi) {
    const baru = !rec, id = rec ? rec.id : uid('RC'), v = rec || isi || {}, jenis = v.jenis || 'Pengeluaran', kini = H.bk(KB.hariIni()), frek = H.frekBerulang(v);
    bukaDrawer(`<form data-form="berulang" data-live="berulang" data-id="${esc(id)}" data-baru="${baru ? 1 : 0}" style="display:contents" novalidate>
      ${kepala(baru ? 'Tambah transaksi berulang' : 'Ubah transaksi berulang', `<span class="idk">ID ${esc(id)}</span>`)}
      <div class="db">
        <div class="note">${ic('info')}<div>Hanya dipakai proyeksi, mulai bulan berikutnya, dan tidak mengubah saldo kas. Dilewati bila bulan itu sudah ada transaksi tercatat yang sama.</div></div>
        <div class="field"><span class="flabel">Jenis</span><div class="seg blk jenis">${['Pengeluaran', 'Pemasukan'].map(j => `<button type="button" class="${j === jenis ? 'on' : ''}" data-act="set-jenis" data-v="${j}">${ic(j === 'Pemasukan' ? 'south_west' : 'north_east', 's18')}${j} rutin</button>`).join('')}</div><input type="hidden" name="jenis" value="${jenis}"></div>
        <div class="field"><span class="flabel">Frekuensi</span><div class="seg blk frek">${H.FREK.map(x => `<button type="button" class="${x === frek ? 'on' : ''}" data-act="set-frek" data-v="${x}">${x === 'Bulanan' ? 'Tiap bulan' : x === 'Tahunan' ? 'Sekali setahun' : 'Idul Fitri'}</button>`).join('')}</div><input type="hidden" name="frek" value="${frek}"></div>
        ${fieldUang('nom', v.nom, 'Nominal per bulan', baru)}
        <div class="field"><span class="flabel">Kategori</span><div data-kat-wadah>${opsiKategori(jenis, v.kat || '')}</div></div>
        <div class="field"><label for="f-ket">Keterangan</label><input id="f-ket" class="inp" name="ket" maxlength="300" value="${esc(v.ket || '')}" placeholder="Contoh: Sewa kos" autocomplete="off"></div>
        <div class="f2"><div class="field" data-frek="Tahunan"><label for="f-bln">Bulan</label><select id="f-bln" class="inp" name="bln">${KB.BULAN.map((b, i) => `<option value="${i + 1}" ${(Number(v.bln) || 6) === i + 1 ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
          <div class="field" data-frek="Bulanan,Tahunan"><label for="f-hari" data-lbl-hari>Tanggal tiap bulan</label><select id="f-hari" class="inp" name="hari">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${(Number(v.hari) || 1) === i + 1 ? 'selected' : ''}>Tanggal ${i + 1}${i + 1 > 28 ? ' (dijepit)' : ''}</option>`).join('')}</select></div>
          <div class="field" data-frek="Idul Fitri"><label for="f-sebelum">Diterima</label><select id="f-sebelum" class="inp" name="sebelum">${Array.from({ length: 31 }, (_, i) => `<option value="${i}" ${(Number(v.sebelum) || 0) === i ? 'selected' : ''}>${i ? 'H-' + i + ' sebelum Lebaran' : 'Tepat hari raya'}</option>`).join('')}</select></div></div>
        <div class="f2"><div class="field"><label for="f-mulai">Mulai bulan</label><input id="f-mulai" class="inp" type="month" name="mulai" value="${v.mulai || kini}" required></div>
          <div class="field"><label for="f-selesai">Selesai bulan</label><input id="f-selesai" class="inp" type="month" name="selesai" value="${v.selesai || ''}"><span class="hint">Kosongkan bila tanpa batas.</span></div></div>
        <label class="row"><span class="switch"><input type="checkbox" name="aktif" ${!rec || rec.aktif ? 'checked' : ''}><span></span></span><span>Aktif</span></label>
        <div class="sim" data-sim></div>
        <p class="err" data-err hidden></p>
      </div>${kaki(baru ? 'Simpan' : 'Simpan perubahan')}</form>`);
    LIVE.berulang($('form[data-form="berulang"]'));
  }
  LIVE.berulang = function (f) {
    const nom = angkaDari(f.nom.value), masuk = f.jenis.value === 'Pemasukan', mulai = f.mulai.value || H.bk(KB.hariIni()), frek = f.frek.value, tanda = masuk ? '+' : '-';
    const efektif = H.geserBulan(H.bk(KB.hariIni()), 1) > mulai ? H.geserBulan(H.bk(KB.hariIni()), 1) : mulai;
    $$('[data-frek]', f).forEach(el => { el.hidden = el.dataset.frek.split(',').indexOf(frek) < 0; });
    f.querySelector('label[for="f-nom"]').textContent = frek === 'Bulanan' ? 'Nominal per bulan' : frek === 'Tahunan' ? 'Nominal per tahun' : 'Nominal tiap Idul Fitri';
    f.querySelector('[data-lbl-hari]').textContent = frek === 'Tahunan' ? 'Tanggal' : 'Tanggal tiap bulan';
    if (frek === 'Bulanan') {
      f.querySelector('[data-sim]').innerHTML = `<div class="row">${ic('query_stats', 's18')}<b>Dampak ke proyeksi</b></div><div class="r2"><div class="bx"><span class="lbl">Per bulan</span><b class="${masuk ? 'plus' : 'minus'}">${tanda}${KB.rp(nom)}</b></div><div class="bx"><span class="lbl">12 bulan</span><b class="${masuk ? 'plus' : 'minus'}">${tanda}${KB.rp(nom * 12)}</b></div></div><span class="hint">Mulai dihitung ${esc(KB.bulan(efektif))}.</span>`;
      return;
    }
    const b = { frek, hari: Number(f.hari.value), bln: Number(f.bln.value), sebelum: Number(f.sebelum.value), mulai: efektif, selesai: f.selesai.value || '' };
    const t = H.berulangBerikut(b, efektif, S.data), raya = t && frek === 'Idul Fitri' ? H.tambahHari(t, b.sebelum) : '';
    const sb = raya ? sumberIdulFitri(raya) : null;
    f.querySelector('[data-sim]').innerHTML = `<div class="row">${ic('query_stats', 's18')}<b>Dampak ke proyeksi</b></div><div class="r2"><div class="bx"><span class="lbl">Sekali setahun</span><b class="${masuk ? 'plus' : 'minus'}">${tanda}${KB.rp(nom)}</b></div><div class="bx"><span class="lbl">Berikutnya</span><b>${t ? esc(KB.tgl(t)) : '—'}</b></div></div>` +
      `<span class="hint">${t ? 'Masuk proyeksi ' + esc(KB.bulan(H.bk(t))) + '.' : 'Tidak ada kejadian dalam rentang mulai–selesai.'}${raya ? ' Idul Fitri ' + esc(KB.tglPanjang(raya)) + ' (' + esc(sb[0]) + ').' : ''}</span>`;
  };
  FORM.berulang = function (f) {
    const baru = f.dataset.baru === '1';
    const frek = f.frek.value;
    const rec = { id: f.dataset.id, jenis: f.jenis.value, kat: ambilKat(f), ket: f.ket.value.trim(), nom: angkaDari(f.nom.value), hari: Number(f.hari.value), mulai: f.mulai.value, selesai: f.selesai.value || '', aktif: f.aktif.checked,
      frek, bln: frek === 'Tahunan' ? Number(f.bln.value) : 0, sebelum: frek === 'Idul Fitri' ? Number(f.sebelum.value) : 0 };
    if (!(rec.nom > 0)) return errForm(f, 'Isi nominal.');
    if (!rec.kat) return errForm(f, 'Pilih kategori.');
    if (!H.bulanValid(rec.mulai)) return errForm(f, 'Bulan mulai tidak valid.');
    if (rec.selesai && rec.selesai < rec.mulai) return errForm(f, 'Bulan selesai harus setelah bulan mulai.');
    pastikanKategori(rec.jenis, rec.kat);
    antre({ act: 'simpan', tabel: 'berulang', rec, baru, cid: baru ? rec.id : uid('OP') });
    tutupDrawer(); KB.toast('Transaksi berulang disimpan.');
  };
  FORM.idulfitri = function (f) {
    const daftar = f.idul_fitri.value.split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
    const salah = daftar.find(x => !H.tglValid(x));
    if (salah) return KB.toast('Tanggal "' + salah + '" tidak valid. Pakai format 2028-02-27.', 'bad');
    const nilai = daftar.filter((x, i) => daftar.indexOf(x) === i).sort().join(',');
    delete UI.idf;
    if (nilai !== (S.data.set.idul_fitri || '')) antre({ act: 'set', kunci: 'idul_fitri', nilai });
    KB.toast(nilai ? 'Koreksi tanggal Idul Fitri disimpan.' : 'Memakai tanggal perkiraan bawaan.');
  };

  /* ---------- Keinginan & hajatan (dana konseptual, terpisah dari kas) ---------- */
  const PRIO = [['Tinggi', 'bad', 'priority_high'], ['Sedang', 'warn', 'drag_handle'], ['Rendah', 'info', 'low_priority']];
  const kgUrut = (a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || (a.id > b.id ? 1 : -1);
  const kgGrup = (prio) => S.data.keinginan.filter(x => x.status !== 'Selesai' && x.prioritas === prio).sort(kgUrut);
  const kgUrutAkhir = (prio, kecuali) => kgGrup(prio).filter(x => x.id !== kecuali).reduce((m, x) => Math.max(m, Number(x.urutan) || 0), 0) + 1;
  /** Pindahkan satu butir ke posisi baru di grupnya. Cukup SATU penyimpanan: urutan diberi nilai di antara kedua tetangga. */
  function kgPindah(id, keIndeks) {
    const x = cari(S.data.keinginan, id); if (!x) return;
    const lain = kgGrup(x.prioritas).filter(y => y.id !== id);
    keIndeks = Math.max(0, Math.min(lain.length, keIndeks));
    const a = lain[keIndeks - 1], b = lain[keIndeks];
    const ua = a ? Number(a.urutan) || 0 : null, ub = b ? Number(b.urutan) || 0 : null;
    let u = ua === null && ub === null ? 1 : ua === null ? ub - 1 : ub === null ? ua + 1 : (ua + ub) / 2;
    if ((ua !== null && u <= ua) || (ub !== null && u >= ub)) {             // celah habis / nilai kembar → nomori ulang grup
      lain.splice(keIndeks, 0, x);
      lain.forEach((y, j) => { if (Number(y.urutan) !== j + 1) antre({ act: 'simpan', tabel: 'keinginan', baru: false, rec: Object.assign({}, y, { urutan: j + 1 }) }); });
      return;
    }
    if (u !== Number(x.urutan)) antre({ act: 'simpan', tabel: 'keinginan', baru: false, rec: Object.assign({}, x, { urutan: u }) });
  }
  function kgGeser(id, arah) {
    const x = cari(S.data.keinginan, id); if (!x) return;
    const i = kgGrup(x.prioritas).findIndex(y => y.id === id);
    kgPindah(id, i + arah);
  }
  VIEW.keinginan = function () {
    const st = UI.kg = UI.kg || { tab: 'aktif' };
    const aktif = S.data.keinginan.filter(x => x.status !== 'Selesai'), selesai = S.data.keinginan.filter(x => x.status === 'Selesai');
    const total = (arr) => arr.reduce((s, x) => s + Number(x.dana || 0), 0);
    const baris = (x, i, n) => `<div class="trow kg ${x._p ? 'pending' : ''}" data-kg="${esc(x.id)}" ${st.tab === 'aktif' ? 'draggable="true"' : ''}>
        ${st.tab === 'aktif' ? `<span class="pegang" title="Seret untuk mengurutkan" aria-hidden="true">${ic('drag_indicator')}</span><span class="no">${i + 1}</span>` : `<div class="ico" style="background:var(--green-bg);color:var(--green-d)">${ic('task_alt')}</div>`}
        <div class="t"><b>${esc(x.nama)}</b><small>${x.publik === 'Tidak' ? `<span class="kg-sembunyi">${ic('public_off', 's16')}Tidak tampil di publik</span> · ` : ''}${x.waktu ? ic('schedule', 's16') + esc(x.waktu) : 'Waktu belum ditentukan'}${st.tab === 'selesai' ? ' · ' + esc(x.prioritas) + (x.selesai ? ' · selesai ' + esc(KB.tglPendek(x.selesai)) : '') : ''}${pend(x)}</small></div>
        <div class="n">${uang(x.dana)}<small>dibutuhkan</small></div>
        <div class="aksi">${st.tab === 'aktif' ? btn('kg-geser', '', 'arrow_upward', 'ghost ico sm', `data-id="${esc(x.id)}" data-arah="-1" aria-label="Naikkan" title="Naikkan" ${i === 0 ? 'disabled' : ''}`) + btn('kg-geser', '', 'arrow_downward', 'ghost ico sm', `data-id="${esc(x.id)}" data-arah="1" aria-label="Turunkan" title="Turunkan" ${i === n - 1 ? 'disabled' : ''}`) : ''}
          ${btn('kg-publik', '', x.publik === 'Tidak' ? 'public_off' : 'public', 'ghost ico sm' + (x.publik === 'Tidak' ? '' : ' kg-pub-on'), `data-id="${esc(x.id)}" aria-pressed="${x.publik !== 'Tidak'}" aria-label="${x.publik === 'Tidak' ? 'Tampilkan di halaman publik' : 'Sembunyikan dari halaman publik'}" title="${x.publik === 'Tidak' ? 'Tidak tampil di publik — klik untuk menampilkan' : 'Tampil di publik — klik untuk menyembunyikan'}"`)}
          ${btn('kg-status', '', st.tab === 'aktif' ? 'task_alt' : 'undo', 'ghost ico sm', `data-id="${esc(x.id)}" aria-label="${st.tab === 'aktif' ? 'Tandai selesai' : 'Aktifkan lagi'}" title="${st.tab === 'aktif' ? 'Tandai selesai' : 'Aktifkan lagi'}"`)}
          ${btn('ubah-kg', '', 'edit', 'ghost ico sm', `data-id="${esc(x.id)}" aria-label="Ubah" title="Ubah"`)}</div></div>`;
    let isi;
    if (st.tab === 'aktif') {
      isi = aktif.length ? PRIO.map(p => {
        const g = kgGrup(p[0]);
        return `<div class="card kg-grup" data-prio="${p[0]}"><div class="card-h"><span class="pill ${p[1]}">${ic(p[2], 's16')}${p[0]}</span><small class="muted">${g.length} butir</small><span class="sp"></span><b class="num">${uang(total(g))}</b>${btn('kg-baru', '', 'add', 'ghost ico sm', `data-prio="${p[0]}" aria-label="Tambah prioritas ${p[0]}" title="Tambah ke grup ini"`)}</div>
          <div class="list">${g.length ? g.map((x, i) => baris(x, i, g.length)).join('') : `<div class="kg-kosong">Belum ada butir prioritas ${p[0].toLowerCase()}.</div>`}</div></div>`;
      }).join('') : `<div class="card">${kosong('volunteer_activism', 'Belum ada keinginan atau hajatan', 'Catat rencana besar seperti umrah, renovasi, atau pernikahan beserta perkiraan dananya.', btn('kg-baru', 'Tambah keinginan', 'add', 'pri mt8'))}</div>`;
    } else {
      const urutSelesai = selesai.slice().sort((a, b) => (a.selesai < b.selesai ? 1 : a.selesai > b.selesai ? -1 : 0));
      isi = `<div class="card"><div class="list">${urutSelesai.length ? urutSelesai.map((x, i) => baris(x, i, urutSelesai.length)).join('') : kosong('task_alt', 'Belum ada yang selesai', 'Butir yang ditandai selesai tersimpan di sini sebagai riwayat.')}</div></div>`;
    }
    return pageH('Rencana', 'Keinginan & hajatan', 'Daftar kebutuhan besar dan perkiraan dananya. Terpisah dari kas: tidak mengubah saldo, proyeksi, laporan, maupun halaman publik.', btn('kg-baru', 'Tambah keinginan', 'add', 'pri')) +
      `<div class="grid g4">
        ${metric('Total dana dibutuhkan', uang(total(aktif)), aktif.length + ' keinginan aktif', 'volunteer_activism')}
        ${PRIO.map(p => metric('Prioritas ' + p[0].toLowerCase(), uang(total(kgGrup(p[0]))), kgGrup(p[0]).length + ' butir', p[2], p[1] === 'bad' ? 'var(--red-d)' : p[1] === 'warn' ? 'var(--amber-d)' : 'var(--teal-d)')).join('')}
      </div>
      ${(() => {
        const on = S.data.set.publik_keinginan !== 'off', semua = S.data.keinginan, tampil = semua.filter(x => x.publik !== 'Tidak').length;
        return `<div class="card mt16 kg-saklar"><div class="set-row"><div class="t"><b>${ic('public', 's18')}Tampilkan di halaman publik</b>
          <small>${on ? `${tampil} dari ${semua.length} butir ditampilkan (hanya bisa dilihat). Atur per butir lewat ikon ${ic('public', 's16')} di tiap baris.` : 'Bagian Keinginan &amp; hajatan disembunyikan seluruhnya dari halaman publik.'}</small></div>
          <label class="switch"><input type="checkbox" data-act="kg-publik-semua" ${on ? 'checked' : ''} aria-label="Tampilkan keinginan di halaman publik"><span></span></label></div></div>`;
      })()}
      <div class="row wrap mt16 mb12"><div class="seg" role="tablist">${[['aktif', 'Aktif (' + aktif.length + ')'], ['selesai', 'Selesai (' + selesai.length + ')']].map(o => `<button type="button" class="${st.tab === o[0] ? 'on' : ''}" data-act="kg-tab" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>
        <span class="sp"></span>${st.tab === 'aktif' && aktif.length > 1 ? `<small class="muted desk-saja">Seret ${ic('drag_indicator', 's16')} atau pakai panah untuk mengurutkan dalam grup.</small>` : ''}</div>
      <div class="stack kg-wadah">${isi}</div>`;
  };
  // Seret-lepas (mouse) untuk mengurutkan dalam satu grup prioritas. Di layar sentuh pakai tombol panah.
  AFTER.keinginan = function () {
    const wadah = $('.kg-wadah'); if (!wadah || wadah._dnd) return; wadah._dnd = true;
    let seret = null;
    wadah.addEventListener('dragstart', (e) => {
      const r = e.target.closest('.trow.kg[draggable]'); if (!r) return;
      seret = { id: r.dataset.kg, prio: r.closest('.kg-grup').dataset.prio }; r.classList.add('diseret');
      e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', seret.id); } catch (er) { }
    });
    const bersih = () => $$('.trow.kg', wadah).forEach(r => r.classList.remove('diseret', 'jatuh-atas', 'jatuh-bawah'));
    wadah.addEventListener('dragover', (e) => {
      if (!seret) return;
      const r = e.target.closest('.trow.kg'), g = e.target.closest('.kg-grup');
      if (!g || g.dataset.prio !== seret.prio) return;                       // hanya dalam grup yang sama
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      $$('.trow.kg', wadah).forEach(x => x.classList.remove('jatuh-atas', 'jatuh-bawah'));
      if (r && r.dataset.kg !== seret.id) { const b = r.getBoundingClientRect(); r.classList.add(e.clientY < b.top + b.height / 2 ? 'jatuh-atas' : 'jatuh-bawah'); }
    });
    wadah.addEventListener('drop', (e) => {
      if (!seret) return; e.preventDefault();
      const r = e.target.closest('.trow.kg'), g = e.target.closest('.kg-grup');
      if (g && g.dataset.prio === seret.prio && r && r.dataset.kg !== seret.id) {
        const lain = kgGrup(seret.prio).filter(y => y.id !== seret.id), j = lain.findIndex(y => y.id === r.dataset.kg);
        const b = r.getBoundingClientRect();
        kgPindah(seret.id, e.clientY < b.top + b.height / 2 ? j : j + 1);
      }
      seret = null; bersih();
    });
    wadah.addEventListener('dragend', () => { seret = null; bersih(); });
  };
  function formKeinginan(rec, prioAwal) {
    const baru = !rec, id = rec ? rec.id : uid('WS'), prio = rec ? rec.prioritas : (prioAwal || 'Sedang'), status = rec ? rec.status : 'Aktif';
    bukaDrawer(`<form data-form="keinginan" data-id="${esc(id)}" data-baru="${baru ? 1 : 0}" style="display:contents" novalidate>
      ${kepala(baru ? 'Tambah keinginan / hajatan' : 'Ubah keinginan', `<span class="idk">ID ${esc(id)}</span>`)}
      <div class="db">
        <div class="note">${ic('info')}<div>Dana ini <b>konseptual</b>: terpisah dari kas utama dan tidak dilacak saldonya. Saldo, proyeksi, dan laporan tidak berubah.</div></div>
        <div class="field"><label for="f-nama">Nama keinginan / hajatan</label><input id="f-nama" class="inp" name="nama" maxlength="120" value="${esc(rec ? rec.nama : '')}" placeholder="Contoh: Umrah orang tua" autocomplete="off" ${baru ? 'autofocus' : ''} required></div>
        ${fieldUang('dana', rec && rec.dana, 'Dana dibutuhkan', false)}
        <div class="chips">${[[-1000000, '−1 jt'], [-100000, '−100 rb'], [100000, '+100 rb'], [1000000, '+1 jt'], [10000000, '+10 jt']].map(c => `<button type="button" class="chip" data-act="kg-dana" data-v="${c[0]}">${c[1]}</button>`).join('')}</div>
        <div class="field"><label for="f-waktu">Waktu <small>teks bebas, tidak harus tanggal</small></label><input id="f-waktu" class="inp" name="waktu" maxlength="80" value="${esc(rec ? rec.waktu : '')}" placeholder="Contoh: Lebaran 2027, setelah lunas KPR" autocomplete="off"></div>
        <div class="field"><span class="flabel">Prioritas</span><div class="seg blk">${PRIO.map(p => `<button type="button" class="${p[0] === prio ? 'on' : ''}" data-act="set-prio" data-v="${p[0]}">${ic(p[2], 's18')}${p[0]}</button>`).join('')}</div><input type="hidden" name="prioritas" value="${prio}"></div>
        <label class="row"><span class="switch"><input type="checkbox" name="publik" ${!rec || rec.publik !== 'Tidak' ? 'checked' : ''}><span></span></span><span>Tampilkan di halaman publik <small class="muted">(hanya bisa dilihat)</small></span></label>
        ${baru ? '' : `<label class="row"><span class="switch"><input type="checkbox" name="selesai" ${status === 'Selesai' ? 'checked' : ''}><span></span></span><span>Sudah tercapai (pindah ke riwayat Selesai)</span></label>`}
        <p class="err" data-err hidden></p>
      </div>${kaki(baru ? 'Simpan' : 'Simpan perubahan', 'pri', baru ? '' : btn('hapus', 'Hapus', 'delete', 'danger sm', `data-tabel="keinginan" data-id="${esc(id)}"`))}</form>`);
  }
  FORM.keinginan = function (f) {
    const baru = f.dataset.baru === '1', lama = baru ? null : cari(S.data.keinginan, f.dataset.id);
    const selesai = !!(f.selesai && f.selesai.checked);
    const rec = { id: f.dataset.id, nama: f.nama.value.trim(), dana: angkaDari(f.dana.value), waktu: f.waktu.value.trim(), prioritas: f.prioritas.value,
      status: selesai ? 'Selesai' : 'Aktif', selesai: selesai ? (lama && lama.selesai) || KB.hariIni() : '', publik: f.publik.checked ? 'Ya' : 'Tidak' };
    if (!rec.nama) return errForm(f, 'Isi nama keinginan atau hajatan.');
    if (!(rec.dana > 0)) return errForm(f, 'Isi dana yang dibutuhkan.');
    // Butir baru, pindah grup, atau aktif lagi → taruh di akhir grup; selain itu urutan tetap.
    rec.urutan = lama && lama.prioritas === rec.prioritas && lama.status === rec.status ? lama.urutan : kgUrutAkhir(rec.prioritas, rec.id);
    antre({ act: 'simpan', tabel: 'keinginan', rec, baru, cid: baru ? rec.id : uid('OP') });
    tutupDrawer(); KB.toast(baru ? 'Keinginan disimpan.' : 'Perubahan disimpan.');
  };

  /* ---------- Form kategori ---------- */
  function formKategori(tipe, rec) {
    const baru = !rec, id = rec ? rec.id : uid('KAT'), ikon = rec ? rec.ikon : 'sell', warna = rec ? rec.warna : WARNA_PILIHAN[0];
    tipe = rec ? rec.tipe : tipe;
    const dipakai = rec ? S.data[TABEL_JENIS[tipe]].filter(x => sama(x.kat, rec.nama)).length : 0;
    bukaDrawer(`<form data-form="kategori" data-id="${esc(id)}" data-baru="${baru ? 1 : 0}" style="display:contents" novalidate>
      ${kepala(baru ? 'Kategori baru' : 'Ubah kategori', esc(tipe))}
      <div class="db"><input type="hidden" name="tipe" value="${tipe}">
        <div class="field"><label for="f-nama">Nama</label><input id="f-nama" class="inp" name="nama" maxlength="40" value="${esc(rec ? rec.nama : '')}" ${baru ? 'autofocus' : ''} required autocomplete="off">${rec && dipakai ? `<span class="hint">Dipakai ${dipakai} transaksi. Mengganti nama tidak mengubah transaksi lama.</span>` : ''}</div>
        <div class="field"><span class="flabel">Ikon</span><div class="ikon-pilih">${IKON_PILIHAN.map(n => `<button type="button" class="${n === ikon ? 'on' : ''}" data-act="pilih-ikon" data-v="${n}" aria-label="${n}">${ic(n)}</button>`).join('')}</div><input type="hidden" name="ikon" value="${ikon}"></div>
        <div class="field"><span class="flabel">Warna</span><div class="warna-pilih">${WARNA_PILIHAN.map(w => `<button type="button" class="${w === warna ? 'on' : ''}" data-act="pilih-warna" data-v="${w}" style="background:${w}" aria-label="Warna ${w}"></button>`).join('')}</div><input type="hidden" name="warna" value="${warna}"></div>
        <p class="err" data-err hidden></p>
      </div>${kaki(baru ? 'Simpan' : 'Simpan perubahan', 'pri', rec ? btn('hapus', 'Hapus', 'delete', 'danger', `data-tabel="kategori" data-id="${esc(rec.id)}"`) : '')}</form>`);
  }
  FORM.kategori = function (f) {
    const baru = f.dataset.baru === '1', rec = { id: f.dataset.id, tipe: f.tipe.value, nama: f.nama.value.trim(), ikon: f.ikon.value, warna: f.warna.value };
    if (!rec.nama) return errForm(f, 'Isi nama kategori.');
    if (S.data.kategori.some(k => k.id !== rec.id && k.tipe === rec.tipe && sama(k.nama, rec.nama))) return errForm(f, 'Kategori ini sudah ada.');
    antre({ act: 'simpan', tabel: 'kategori', rec, baru, cid: baru ? rec.id : uid('OP') });
    tutupDrawer(); KB.toast('Kategori disimpan.');
  };
  FORM.tampilan = function (f) {
    const set = S.data.set;
    [['nama_app', f.nama_app.value.trim() || 'Kas Bandhits'], ['logo_url', f.logo_url.value.trim()]].forEach(p => { if (set[p[0]] !== p[1]) antre({ act: 'set', kunci: p[0], nilai: p[1] }); });
    KB.toast('Tampilan disimpan.');
  };
  FORM.migrasi = function (f, mode) {
    const st = UI.set.mig;
    st.sumber = f.sumber.value.trim();
    st.tabel = $$('input[name="tabel"]:checked', f).map(i => i.value);
    st.timpa = f.timpa.checked; st.pengaturan = f.pengaturan.checked;
    if (!st.sumber) return KB.toast('Isi URL spreadsheet lama.', 'bad');
    if (!st.tabel.length) return KB.toast('Pilih minimal satu data.', 'bad');
    const jalan = () => {
      st.sibuk = true; render();
      panggil(mode === 'jalankan' ? 'migrasi.jalankan' : 'migrasi.pindai', { sumber: st.sumber, tabel: st.tabel, timpa: st.timpa, pengaturan: st.pengaturan }, { timeout: 330000 })
        .then(j => { st.hasil = j.r; if (j.ver) S.ver = j.ver; if (j.r.perluSinkron) sinkron(true, true); KB.toast(mode === 'jalankan' ? 'Impor selesai.' : 'Pindai selesai.'); })
        .catch(e => { if (e.code !== 'AUTH') KB.toast(e.message, 'bad'); })
        .finally(() => { st.sibuk = false; render(); });
    };
    if (mode === 'jalankan') konfirmasi('Jalankan impor?', 'Data dari spreadsheet lama ditambahkan ke app ini. Spreadsheet lama tidak diubah. Disarankan Pindai dulu.', 'Jalankan impor').then(ok => ok && jalan());
    else jalan();
  };

  /* ===================== EKSPOR CSV ===================== */
  function unduhCsv(nama, baris) {
    const csv = '﻿' + baris.map(r => r.map(v => { const s = String(v === null || v === undefined ? '' : v); return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = nama + '-' + KB.hariIni() + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ===================== AKSI (event delegation) ===================== */
  const AKSI = {
    tutup: () => { if (_konfirm) { const k = _konfirm; _konfirm = null; tutupDrawer(); return k(false); } tutupDrawer(); },
    menu: (el, e) => {
      e.preventDefault();
      bukaDrawer(`${kepala('Menu')}<div class="db"><div class="menu-grid">${MENU_DATAR.filter(m => menuTampil(m[0])).map(m => `<a href="#/${m[0]}" class="${UI.view === m[0] ? 'aktif' : ''}">${ic(m[2])}${m[1]}</a>`).join('')}</div>
        <div class="row mt12">${btn('keluar', 'Keluar', 'logout', 'danger sm')}<span class="sp"></span><span class="sub">${esc(S.sesi ? S.sesi.email : '')}</span></div></div>`);
    },
    'tambah-cepat': () => bukaDrawer(`${kepala('Catat transaksi')}<div class="db"><div class="grid g3" style="gap:8px">
        ${btn('tx-baru', 'Pemasukan', 'south_west', 'lg blk', 'data-jenis="Pemasukan" style="color:var(--green-d)"')}${btn('tx-baru', 'Pengeluaran', 'north_east', 'lg blk', 'data-jenis="Pengeluaran" style="color:var(--red-d)"')}${btn('bayar-pilih', 'Bayar cicilan', 'account_balance', 'lg blk')}</div></div>`),
    'tx-baru': (el) => formTx(el.dataset.jenis),
    'ubah-tx': (el) => { const x = cari(S.data[el.dataset.tabel], el.dataset.id); if (x) formTx(el.dataset.tabel === 'pemasukan' ? 'Pemasukan' : 'Pengeluaran', x); },
    'pinjaman-baru': () => formPinjaman(),
    'ubah-pinjaman': (el) => { const x = cari(S.data.pinjaman, el.dataset.id); if (x) formPinjaman(x); },
    bayar: (el) => formBayar(el.dataset.pid),
    'bayar-pilih': () => pilihPinjaman(),
    'berulang-baru': () => formBerulang(),
    'berulang-isi': (el) => formBerulang(null, ISI_BERULANG[el.dataset.v]),
    'ubah-berulang': (el) => { const x = cari(S.data.berulang, el.dataset.id); if (x) formBerulang(x); },
    'berulang-aktif': (el) => { const x = cari(S.data.berulang, el.dataset.id); if (x) antre({ act: 'simpan', tabel: 'berulang', baru: false, rec: Object.assign({}, x, { aktif: el.checked }) }); },
    'kg-baru': (el) => formKeinginan(null, el.dataset.prio),
    'ubah-kg': (el) => { const x = cari(S.data.keinginan, el.dataset.id); if (x) formKeinginan(x); },
    'kg-tab': (el) => { UI.kg = Object.assign(UI.kg || {}, { tab: el.dataset.v }); render(); },
    'kg-geser': (el) => kgGeser(el.dataset.id, Number(el.dataset.arah)),
    'kg-publik': (el) => {
      const x = cari(S.data.keinginan, el.dataset.id); if (!x) return;
      const tampil = x.publik === 'Tidak';
      antre({ act: 'simpan', tabel: 'keinginan', baru: false, rec: Object.assign({}, x, { publik: tampil ? 'Ya' : 'Tidak' }) });
      KB.toast(tampil ? '"' + x.nama + '" tampil di halaman publik.' : '"' + x.nama + '" disembunyikan dari halaman publik.');
    },
    'kg-publik-semua': (el) => { antre({ act: 'set', kunci: 'publik_keinginan', nilai: el.checked ? 'on' : 'off' }); KB.toast(el.checked ? 'Keinginan ditampilkan di halaman publik.' : 'Keinginan disembunyikan dari halaman publik.'); },
    'kg-status': (el) => {
      const x = cari(S.data.keinginan, el.dataset.id); if (!x) return;
      const selesai = x.status !== 'Selesai';
      const rec = Object.assign({}, x, { status: selesai ? 'Selesai' : 'Aktif', selesai: selesai ? KB.hariIni() : '' });
      if (!selesai) rec.urutan = kgUrutAkhir(x.prioritas);            // aktif lagi → masuk akhir grupnya
      antre({ act: 'simpan', tabel: 'keinginan', baru: false, rec });
      KB.toast(selesai ? 'Ditandai selesai. Tersimpan di tab Selesai.' : 'Diaktifkan kembali.');
    },
    'set-prio': (el) => { const f = el.closest('form'); f.prioritas.value = el.dataset.v; $$('[data-act="set-prio"]', f).forEach(c => c.classList.toggle('on', c === el)); },
    'kg-dana': (el) => { const f = el.closest('form'), n = Math.max(0, angkaDari(f.dana.value) + Number(el.dataset.v)); f.dana.value = n ? KB.angka(n) : ''; },
    'kategori-baru': (el) => formKategori(el.dataset.tipe),
    'ubah-kategori': (el) => { const x = cari(S.data.kategori, el.dataset.id); if (x) formKategori(x.tipe, x); },
    hapus: (el) => {
      const t = el.dataset.tabel, id = el.dataset.id, x = cari(S.data[t], id);
      if (!x) return;
      const judul = { pemasukan: 'Hapus pemasukan?', pengeluaran: 'Hapus pengeluaran?', bayar: 'Batalkan pembayaran?', pinjaman: 'Hapus pinjaman?', berulang: 'Hapus transaksi berulang?', kategori: 'Hapus kategori?', keinginan: 'Hapus keinginan?' }[t];
      const nBayar = t === 'pinjaman' ? S.data.bayar.filter(b => b.pid === id).length : 0;
      const pesan = t === 'pinjaman' ? (nBayar ? `${nBayar} riwayat pembayaran dipindah ke Pengeluaran kategori "Tagihan", jadi saldo kas tidak berubah.` : 'Pinjaman tanpa pembayaran akan dihapus.')
        : t === 'bayar' ? `Pembayaran ${KB.rp(x.nom)} tanggal ${KB.tgl(x.tgl)} dibatalkan dan sisa pinjaman bertambah lagi.`
          : t === 'kategori' ? 'Transaksi lama yang memakai kategori ini tidak berubah.'
          : t === 'keinginan' ? `"${x.nama}" (${KB.rp(x.dana)}) dihapus permanen. Untuk menyimpannya sebagai riwayat, pakai Tandai selesai.` : `${x.kat || x.ket || ''} ${KB.rp(x.nom)} pada ${KB.tgl(x.tgl || '')} akan dihapus permanen.`;
      konfirmasi(judul, pesan, t === 'bayar' ? 'Batalkan pembayaran' : 'Hapus', true).then(ok => {
        tutupDrawer(true);
        if (ok) { antre({ act: 'hapus', tabel: t, id, cid: 'hapus:' + t + ':' + id }); KB.toast(t === 'bayar' ? 'Pembayaran dibatalkan.' : 'Dihapus.'); }
      });
    },
    'pilih-kat': (el) => {
      const f = el.closest('form'), v = el.dataset.v;
      $$('[data-act="pilih-kat"]', f).forEach(c => c.classList.toggle('on', c === el));
      f.kat.value = v; f.katBaru.hidden = v !== '__baru';
      if (v === '__baru') f.katBaru.focus();
    },
    'pilih-ikon': (el) => { const f = el.closest('form'); $$('[data-act="pilih-ikon"]', f).forEach(c => c.classList.toggle('on', c === el)); f.ikon.value = el.dataset.v; },
    'pilih-warna': (el) => { const f = el.closest('form'); $$('[data-act="pilih-warna"]', f).forEach(c => c.classList.toggle('on', c === el)); f.warna.value = el.dataset.v; },
    'set-jangka': (el) => { const f = el.closest('form'); f.jangka.value = el.dataset.v; LIVE.pinjaman(f); },
    'set-frek': (el) => {
      const f = el.closest('form'); f.frek.value = el.dataset.v;
      $$('[data-act="set-frek"]', f).forEach(c => c.classList.toggle('on', c === el));
      LIVE.berulang(f);
    },
    'set-jenis': (el) => {
      const f = el.closest('form'); f.jenis.value = el.dataset.v;
      $$('[data-act="set-jenis"]', f).forEach(c => c.classList.toggle('on', c === el));
      f.querySelector('[data-kat-wadah]').innerHTML = opsiKategori(el.dataset.v, '');
      LIVE.berulang(f);
    },
    'isi-nom': (el) => { const f = el.closest('form'); f.nom.value = KB.angka(el.dataset.v); LIVE.bayar(f); },
    'pin-f': (el) => { UI.pin.f = el.dataset.v; render(); },
    'pin-detail': (el) => { UI.pin.buka[el.dataset.id] = !UI.pin.buka[el.dataset.id]; render(); },
    'kal-pilih': (el) => { UI.kal.pilih = el.dataset.tgl; render(); },
    'kal-geser': (el) => { UI.kal.bln = H.geserBulan(UI.kal.bln, +el.dataset.n); UI.kal.pilih = UI.kal.bln + '-01'; render(); },
    'kal-kini': () => { const t = KB.hariIni(); UI.kal.bln = H.bk(t); UI.kal.pilih = t; render(); },
    'kal-f': (el) => { UI.kal.f = el.dataset.v; render(); },
    'riw-jenis': (el) => { UI.riw.jenis = el.dataset.v; UI.riw.n = 150; render(); },
    'lap-periode': (el) => { UI.lap.periode = el.dataset.v; render(); },
    'lap-preset': (el) => { const r = rentangPreset(el.dataset.v, KB.hariIni()); Object.assign(UI.lap, { preset: el.dataset.v, dari: r[0], sampai: r[1] }); render(); },
    'lap-rinci': () => { UI.lap.rinci = !UI.lap.rinci; render(); },
    'reset-filter': (el) => { Object.assign(UI[el.dataset.tabel], { q: '', kat: '', bln: '', n: 150 }); render(); },
    lebih: (el) => { UI[el.dataset.st].n += 150; render(); },
    'set-tipe': (el) => { UI.set.tipe = el.dataset.v; render(); },
    cetak: () => { UI.lap.rinci = true; render(); setTimeout(() => window.print(), 50); },
    'csv-buku': (el) => {
      const t = TABEL_JENIS[el.dataset.jenis];
      unduhCsv(t, [['ID', 'Tanggal', 'Kategori', 'Keterangan', 'Nominal']].concat(S.data[t].slice().sort((a, b) => a.tgl < b.tgl ? -1 : 1).map(x => [x.id, x.tgl, x.kat, x.ket, x.nom])));
    },
    'csv-riwayat': () => unduhCsv('riwayat', [['Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Nominal']].concat(M().gab.map(x => [x.tgl, x.jenis, x.kat, x.ket, x.nom]))),
    'csv-laporan': () => {
      const L = UI.lapHasil; if (!L) return;
      unduhCsv('laporan-' + UI.lap.periode, [['Periode', 'Pemasukan', 'Pengeluaran', 'Cicilan', 'Bersih', 'Jumlah']].concat(L.grup.map(g => [g.kunci, g.pemasukan, g.pengeluaran, g.cicilan, g.bersih, g.jumlah]))
        .concat([[], ['Tanggal', 'Jenis', 'Kategori', 'Keterangan', 'Nominal']]).concat(L.rows.map(x => [x.tgl, x.jenis, x.kat, x.ket, x.nom])));
    },
    'csv-proyeksi': () => unduhCsv('proyeksi-36-bulan', [['Bulan', 'Saldo awal', 'Pemasukan', 'Pengeluaran', 'Cicilan', 'Saldo akhir']].concat(M().proy.map(r => [r.bulan, r.saldoAwal, r.pemasukan, r.pengeluaran, r.cicilan, r.saldoAkhir]))),
    sinkron: () => { sinkron(true); pompa(); },
    'sinkron-penuh': (el) => {
      el.disabled = true;
      panggil('data.segarkan').then(j => { if (j.ver) S.ver = j.ver; return sinkron(true, true); }).then(() => KB.toast('Data dimuat ulang dari Google Sheets.'))
        .catch(e => e.code !== 'AUTH' && KB.toast(e.message, 'bad')).finally(() => { el.disabled = false; render(); });
    },
    privasi: () => { S.privasi = !S.privasi; KB.ls.set('kb_privasi', S.privasi); document.body.classList.toggle('privasi', S.privasi); aturShell(); },
    'privasi-set': (el) => { S.privasi = el.checked; KB.ls.set('kb_privasi', S.privasi); document.body.classList.toggle('privasi', S.privasi); aturShell(); },
    tema: (el) => { S.tema = el.checked ? 'gelap' : 'terang'; KB.ls.set('kb_tema', S.tema); terapkanTema(); },
    'menu-tampil': (el) => {
      const k = el.dataset.menu, sem = menuSembunyi().filter(x => x !== k);
      if (!el.checked) sem.push(k);
      const urut = MENU_DATAR.map(m => m[0]).filter(x => sem.indexOf(x) > -1);
      antre({ act: 'set', kunci: 'menu_sembunyi', nilai: urut.join(',') });
      const m = MENU_DATAR.find(x => x[0] === k); KB.toast('Menu ' + m[1] + (el.checked ? ' ditampilkan.' : ' disembunyikan.'));
    },
    'dash-atur': () => { UI.dashAtur = !UI.dashAtur; render(); },
    'dash-tampil': (el) => {
      const k = el.dataset.k, sem = dashSembunyi().filter(x => x !== k);
      if (!el.checked) sem.push(k);
      antre({ act: 'set', kunci: 'dash_sembunyi', nilai: DASH.map(d => d[0]).filter(x => sem.indexOf(x) > -1).join(',') });
      const d = DASH.find(x => x[0] === k); KB.toast(d[1] + (el.checked ? ' ditampilkan.' : ' disembunyikan.'));
    },
    'pub-tampil': (el) => {
      const k = el.dataset.k, d = PUB.find(x => x[0] === k);
      if (k === 'keinginan') antre({ act: 'set', kunci: 'publik_keinginan', nilai: el.checked ? 'on' : 'off' });
      else {
        const sem = pubSembunyi().filter(x => x !== k);
        if (!el.checked) sem.push(k);
        antre({ act: 'set', kunci: 'publik_sembunyi', nilai: PUB.map(x => x[0]).filter(x => sem.indexOf(x) > -1).join(',') });
      }
      KB.toast(d[1] + (el.checked ? ' ditampilkan di halaman publik.' : ' disembunyikan dari halaman publik.'));
    },
    'pub-semua': () => {
      if (pubSembunyi().length) antre({ act: 'set', kunci: 'publik_sembunyi', nilai: '' });
      if (!pubTampil('keinginan')) antre({ act: 'set', kunci: 'publik_keinginan', nilai: 'on' });
      KB.toast('Semua bagian halaman publik ditampilkan.');
    },
    'tahan-coba': () => { P.tahan = null; P.cobaErr = 0; pompa(); render(); },
    'tahan-cek': () => cekUlangTahan(),
    'tahan-buang': () => konfirmasi('Buang perubahan ini?', 'Perubahan yang ditolak server dihapus dari perangkat ini, lalu data diambil ulang dari server. Perubahan lain di antrean tetap dikirim.', 'Buang', true).then(ok => {
      tutupDrawer(true); if (!ok || !S.ob.length) return;
      const op = S.ob.shift(); simpanOb(); P.tahan = null; P.cobaErr = 0;
      if (op.act === 'simpan' && op.baru && S.data[op.tabel]) { S.data[op.tabel] = S.data[op.tabel].filter(x => x.id !== op.rec.id); S.rev++; }
      KB.toast('Perubahan dibuang.'); render();
      sinkron(true, true).then(() => { render(); pompa(); }, () => pompa());
    }),
    'dash-semua': () => { antre({ act: 'set', kunci: 'dash_sembunyi', nilai: '' }); KB.toast('Semua bagian dashboard ditampilkan.'); },
    'menu-semua': () => { antre({ act: 'set', kunci: 'menu_sembunyi', nilai: '' }); KB.toast('Semua menu ditampilkan.'); },
    'publik-aktif': (el) => { antre({ act: 'set', kunci: 'publik_aktif', nilai: el.checked ? 'on' : 'off' }); KB.toast(el.checked ? 'Halaman publik dinyalakan.' : 'Halaman publik dimatikan.'); },
    keluar: () => keluar(),
    pasang: () => KB.pasangSekarang().then(() => render()),
    salin: (el) => { const t = el.dataset.teks; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => KB.toast('Disalin.'), () => KB.toast('Salin manual dari kotak di atas.', 'warn')); },
    'chip-cek': (el) => { el.closest('.chip').classList.toggle('on', el.checked); },
    'kunci-ganti': () => konfirmasi('Buat alamat rahasia baru?', 'Alamat admin lama langsung tidak berlaku. Sesi yang sedang berjalan tetap aktif.', 'Buat alamat baru').then(ok => {
      tutupDrawer(true); if (!ok) return;
      panggil('kunci.ganti').then(j => { S.k = j.r.k; KB.ls.set('kb_k', S.k); UI.set.kunciBaru = j.r.k; UI.set.info = null; render(); }).catch(e => e.code !== 'AUTH' && KB.toast(e.message, 'bad'));
    }),
    'cabut-sesi': () => konfirmasi('Cabut semua sesi?', 'Semua perangkat, termasuk yang ini, harus masuk lagi dengan Google.', 'Cabut semua', true).then(ok => {
      tutupDrawer(true); if (ok) panggil('sesi.cabutSemua').then(() => { S.sesi = null; KB.ls.del('kb_sesi'); mintaLogin(); }).catch(e => e.code !== 'AUTH' && KB.toast(e.message, 'bad'));
    }),
    'cadangan-buat': (el) => { el.disabled = true; panggil('backup.buat', {}, { timeout: 120000 }).then(j => { KB.toast('Cadangan dibuat: ' + j.r.nama); UI.set.cadangan = null; render(); }).catch(e => e.code !== 'AUTH' && KB.toast(e.message, 'bad')).finally(() => { el.disabled = false; }); },
    'cadangan-jadwal': (el) => panggil('backup.jadwal', { aktif: el.checked }).then(j => { UI.set.cadangan.terjadwal = j.r.terjadwal; KB.toast(j.r.terjadwal ? 'Cadangan bulanan aktif.' : 'Cadangan bulanan dimatikan.'); render(); }).catch(e => { el.checked = !el.checked; if (e.code !== 'AUTH') KB.toast(e.message, 'bad'); }),
    'kalender-sinkron': (el) => { el.disabled = true; KB.toast('Menyinkronkan ke Google Calendar…'); panggil('kalender.sinkron', {}, { timeout: 120000 }).then(j => KB.toast(j.r.dibuat ? j.r.dibuat + ' acara cicilan ditambahkan ke Google Calendar.' : 'Semua cicilan sudah ada di Google Calendar.')).catch(e => e.code !== 'AUTH' && KB.toast(e.message, 'bad')).finally(() => { el.disabled = false; }); }
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (el.tagName === 'INPUT' && el.type === 'checkbox') return;   // ditangani event change
    const fn = AKSI[el.dataset.act];
    if (fn) { if (el.tagName === 'A' || el.type === 'button') e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.matches('input[type=checkbox][data-act]')) { const fn = AKSI[el.dataset.act]; if (fn) fn(el, e); return; }
    if (el.dataset.filter && el.tagName !== 'INPUT') aturFilter(el);
    if (el.dataset.filter && el.type === 'date') aturFilter(el);
    const f = el.closest('form[data-live]'); if (f && LIVE[f.dataset.live]) LIVE[f.dataset.live](f);
  });
  let _cariT = null;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.classList.contains('uang')) {
      const n = angkaDari(el.value); el.value = n ? KB.angka(n) : '';
    }
    if (el.dataset.filter && el.type === 'search') { clearTimeout(_cariT); _cariT = setTimeout(() => aturFilter(el), 140); }
    // Isian alamat migrasi tidak hilang bila halaman Pengaturan digambar ulang (mis. daftar cadangan selesai dimuat).
    if (el.name === 'sumber' && el.closest('form[data-form="migrasi"]') && UI.set) UI.set.mig.sumber = el.value;
    if (el.name === 'idul_fitri' && el.closest('form[data-form="idulfitri"]')) UI.idf = el.value;   // sama: koreksi Idul Fitri
    const f = el.closest('form[data-live]'); if (f && LIVE[f.dataset.live]) LIVE[f.dataset.live](f);
    const err = el.closest('form') && el.closest('form').querySelector('[data-err]'); if (err) err.hidden = true;
  });
  function aturFilter(el) {
    const st = UI[el.dataset.filter]; if (!st) return;
    st[el.dataset.f] = el.value;
    if (el.dataset.filter === 'lap' && (el.dataset.f === 'dari' || el.dataset.f === 'sampai')) st.preset = '';
    if ('n' in st) st.n = 150;
    render();
  }
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    e.preventDefault();
    if (f.dataset.form === 'konfirm') { const k = _konfirm; _konfirm = null; tutupDrawer(); return k && k(true); }
    if (f.dataset.kunci && Date.now() - +f.dataset.kunci < 800) return;   // ketuk ganda di form yang sama
    f.dataset.kunci = Date.now();
    const fn = FORM[f.dataset.form]; if (fn) fn(f, e.submitter && e.submitter.value);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && _laci) AKSI.tutup(); });
  document.addEventListener('kb:pasang', () => { if (UI.view === 'pengaturan') renderRingan(); });

  /* ===================== MULAI ===================== */
  function terapkanTema() { document.documentElement.setAttribute('data-tema', S.tema === 'gelap' ? 'gelap' : 'terang'); const m = $('meta[name="theme-color"]'); if (m) m.content = S.tema === 'gelap' ? '#0B1220' : '#0F1C2E'; }
  function mulai() {
    terapkanTema();
    const u = new URL(location.href), k = u.searchParams.get('k');
    if (k) {
      if (k !== S.k) { KB.ls.del('kb_cid'); S.cid = ''; }
      S.k = k; KB.ls.set('kb_k', k);
      u.searchParams.delete('k'); history.replaceState(null, '', u.pathname + u.search + u.hash);   // kunci tidak tertinggal di bilah alamat
    }
    KB.daftarSW();
    if (!KB.siap) return layarPesan('settings', 'Konfigurasi belum lengkap', 'Isi GAS_URL di js/config.js dengan alamat /exec Apps Script.');
    KB.hangatkan();
    if (sesiValid() && S.data) { S.ob.forEach(terapkan); bangunShell(); sinkron(true); pompa(); return; }
    if (!S.k) return layarNetral();
    layarGerbang();
  }
  window.KBAdmin = { S, UI, M, sinkron, pompa };                         // bantu diagnosa di console
  mulai();
})();
