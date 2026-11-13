/* =====================================================================
 * KAS BANDHITS — Halaman publik (hanya baca, tanpa login)
 * Enam bagian: saldo kas, pemasukan & pengeluaran bulan berjalan,
 * pengingat jatuh tempo per minggu (tiap minggu bisa dibuka/tutup), proyeksi 5 bulan,
 * 5 transaksi terbaru. Kartu utama berkilau terus dan membesar saat disorot;
 * cicilan yang mendekati jatuh tempo (≤ 7 hari) berdenyut sampai dibayar.
 * Tampil instan dari salinan lokal, lalu diperbarui dari server.
 * ===================================================================== */
(function () {
  'use strict';
  var KB = window.KB, esc = KB.esc, ic = KB.ic, uang = KB.uang;
  var root = document.getElementById('pub'), status = document.getElementById('status');
  var terakhirAmbil = 0, sibuk = false;
  // Buka/tutup per minggu. Bawaan: minggu berjalan & minggu yang punya cicilan mendesak terbuka.
  // Pilihan pengguna diingat per bulan (bulan berganti → kembali ke bawaan).
  var mgPilih = KB.ls.get('kb_pub_mg', null);
  var MAKS_TERBARU = 5, DEKAT = 7;

  /** Selisih hari kalender a → b (format YYYY-MM-DD). */
  function selisih(a, b) {
    function u(t) { return Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10)); }
    return Math.round((u(b) - u(a)) / 864e5);
  }

  function setStatus(teks, kelas) { status.className = 'sync ' + (kelas || ''); status.innerHTML = '<span class="dot"></span>' + esc(teks); }

  function ikonJenis(j) { return j === 'Pemasukan' ? ['south_west', 'var(--green-bg)', 'var(--green-d)'] : j === 'Cicilan' ? ['account_balance', 'var(--teal-bg)', 'var(--teal-d)'] : ['north_east', 'var(--red-bg)', 'var(--red-d)']; }

  function render(s) {
    var hari = s.hariIni, kini = s.bulan.kunci;
    if (s.meta) {
      document.getElementById('nama').textContent = s.meta.nama || 'Kas Bandhits';
      if (s.meta.logo) document.getElementById('logo').src = s.meta.logo;
      document.title = (s.meta.nama || 'Kas Bandhits') + ' — Ringkasan Keuangan';
    }
    var html = '';
    // 1. Saldo kas
    html += '<section class="card hero metric kilau" aria-label="Saldo kas">' +
      '<div class="top"><span class="lbl">Saldo kas saat ini</span><span class="pill info" style="background:rgba(255,255,255,.08);color:#9EE6E5">' + ic('verified', 's16') + 'Per ' + esc(KB.tglPendek(hari)) + '</span></div>' +
      '<div class="v">' + uang(s.saldoKas) + '</div>' +
      '<div class="foot">Transaksi bertanggal sampai hari ini · ' + esc(KB.tglPanjang(hari)) + '</div></section>';
    // 2–3. Pemasukan & pengeluaran bulan berjalan
    html += '<section class="grid g2">' +
      '<div class="card metric kilau kilau-in"><div class="top"><span class="lbl">Pemasukan ' + esc(KB.bulan(kini)) + '</span><span class="ibox" style="color:var(--green-d)">' + ic('south_west') + '</span></div>' +
      '<div class="v plus">' + uang(s.bulan.pemasukan) + '</div><div class="foot">' + s.bulan.jmlPemasukan + ' transaksi s.d. hari ini</div></div>' +
      '<div class="card metric kilau kilau-out"><div class="top"><span class="lbl">Pengeluaran ' + esc(KB.bulan(kini)) + '</span><span class="ibox" style="color:var(--red-d)">' + ic('north_east') + '</span></div>' +
      '<div class="v minus">' + uang(s.bulan.pengeluaran) + '</div><div class="foot">' + s.bulan.jmlPengeluaran + ' transaksi' +
      (s.bulan.cicilan ? ' · termasuk cicilan ' + uang(s.bulan.cicilan) : '') + '</div></div></section>';
    // 4. Pengingat jatuh tempo — tiap minggu bisa dibuka/tutup sendiri
    var pg = s.pengingat, mingguKini = Hari.mingguKe(hari), mendesak = pg.tunggakan.length;
    if (!mgPilih || mgPilih.bulan !== kini) mgPilih = { bulan: kini, buka: {} };
    var kartu = pg.minggu.map(function (m, i) {
      var desakMinggu = 0, belum = 0;
      var items = m.items.map(function (it) {
        var n = selisih(hari, it.tgl), kelas = it.lunas ? 'lunas' : n < 0 ? 'telat' : n <= DEKAT ? 'dekat' : '';
        if (kelas === 'telat' || kelas === 'dekat') desakMinggu++;
        if (!it.lunas) belum++;
        return '<div class="it ' + kelas + '"><div class="row"><b style="font-size:13px">' + esc(it.pihak) + '</b><span class="sp"></span>' +
          (it.lunas ? '<span class="pill ok">' + ic('check', 's16') + 'Lunas</span>' : '<span class="pill ' + (n < 0 ? 'bad' : 'warn') + '">' + esc(KB.tglPendek(it.tgl)) + '</span>') + '</div>' +
          '<div class="row"><small class="muted">Cicilan ' + it.ke + '/' + it.dari + (it.lunas ? '' : ' · ' + esc(KB.hLagi(n))) + '</small><span class="sp"></span>' + uang(it.lunas ? it.nominal : it.sisa) + '</div></div>';
      }).join('');
      mendesak += desakMinggu;
      var rentang = +m.dari.slice(8) + '–' + +m.sampai.slice(8) + ' ' + KB.BLN[+m.dari.slice(5, 7) - 1];
      var kelasKartu = 'card mg' + (i === mingguKini ? ' kini' : '');
      if (!m.items.length) {
        return '<div class="' + kelasKartu + ' kosong-mg"><div class="row"><span class="lbl">Minggu ' + m.ke + '</span><span class="sp"></span><small class="mono muted">' + rentang + '</small></div>' +
          '<div class="row ringkas"><small class="muted">' + ic(i < mingguKini ? 'task_alt' : 'event_available', 's16') + 'Tidak ada jadwal</small></div></div>';
      }
      var buka = Object.prototype.hasOwnProperty.call(mgPilih.buka, i) ? !!mgPilih.buka[i] : (i === mingguKini || desakMinggu > 0);
      var status = !belum ? '<span class="pill ok">' + ic('check', 's16') + 'Lunas semua</span>'
        : desakMinggu ? '<span class="pill bad kedip">' + ic('notifications_active', 's16') + desakMinggu + ' segera</span>'
        : '<span class="pill warn">' + belum + ' belum</span>';
      return '<div class="' + kelasKartu + (buka ? '' : ' tutup') + (desakMinggu && !buka ? ' desak' : '') + '" data-mg="' + i + '">' +
        '<div class="mg-h" role="button" tabindex="0" aria-expanded="' + buka + '" aria-controls="mgIsi' + i + '" aria-label="Minggu ' + m.ke + ', ' + rentang + '">' +
        '<div class="row"><span class="lbl">Minggu ' + m.ke + '</span><span class="sp"></span><small class="mono muted">' + rentang + '</small><span class="panah">' + ic('expand_more') + '</span></div>' +
        '<div class="row ringkas"><small class="muted">' + m.items.length + ' cicilan · <b class="num">' + KB.rp(m.total) + '</b></small><span class="sp"></span>' + status + '</div></div>' +
        '<div class="mg-isi" id="mgIsi' + i + '"' + (buka ? '' : ' hidden') + '>' + items + '</div></div>';
    }).join('');
    // Awal bulan depan: cicilan yang jatuh tempo ≤ 7 hari lagi tetapi sudah masuk bulan berikutnya
    var depan = (pg.bulanDepan || []).filter(function (it) { return !it.lunas; });
    if (depan.length) {
      mendesak += depan.length;
      var kDepan = depan[0].tgl.slice(0, 7), totDepan = depan.reduce(function (t, x) { return t + x.sisa; }, 0);
      var bukaD = Object.prototype.hasOwnProperty.call(mgPilih.buka, 'd') ? !!mgPilih.buka.d : true;
      kartu += '<div class="card mg depan' + (bukaD ? '' : ' tutup desak') + '" data-mg="d">' +
        '<div class="mg-h" role="button" tabindex="0" aria-expanded="' + bukaD + '" aria-controls="mgIsid" aria-label="Awal bulan depan">' +
        '<div class="row"><span class="lbl">Awal bulan depan</span><span class="sp"></span><small class="mono muted">' + esc(KB.bulan(kDepan)) + '</small><span class="panah">' + ic('expand_more') + '</span></div>' +
        '<div class="row ringkas"><small class="muted">' + depan.length + ' cicilan · <b class="num">' + KB.rp(totDepan) + '</b></small><span class="sp"></span>' +
        '<span class="pill bad kedip">' + ic('notifications_active', 's16') + depan.length + ' segera</span></div></div>' +
        '<div class="mg-isi" id="mgIsid"' + (bukaD ? '' : ' hidden') + '>' + depan.map(function (it) {
          var n = selisih(hari, it.tgl);
          return '<div class="it dekat"><div class="row"><b style="font-size:13px">' + esc(it.pihak) + '</b><span class="sp"></span><span class="pill warn">' + esc(KB.tglPendek(it.tgl)) + '</span></div>' +
            '<div class="row"><small class="muted">Cicilan ' + it.ke + '/' + it.dari + ' · ' + esc(KB.hLagi(n)) + '</small><span class="sp"></span>' + uang(it.sisa) + '</div></div>';
        }).join('') + '</div></div>';
    }
    html += '<section><div class="sec-h"><div class="t"><h2>Pengingat jatuh tempo</h2><p>Cicilan ' + esc(KB.bulan(kini)) + ' per minggu · ketuk minggu untuk buka/tutup</p></div>' +
      '<div class="aksi">' + (mendesak ? '<span class="pill bad kedip">' + ic('notifications_active', 's16') + mendesak + ' perlu segera dibayar</span>' : '') +
      '<span class="pill ' + (pg.sisaBulan ? 'warn' : 'ok') + '">' + (pg.sisaBulan ? 'Belum dibayar ' + KB.rp(pg.sisaBulan) : 'Semua terbayar') + '</span></div></div>';
    if (pg.tunggakan.length) {
      html += '<div class="note bad mb12 kedip">' + ic('warning') + '<div><b>Tunggakan bulan sebelumnya: ' + uang(pg.totalTunggakan) + '</b><br>' +
        pg.tunggakan.map(function (t) { return esc(t.pihak) + ' cicilan ke-' + t.ke + ' (' + esc(KB.tglPendek(t.tgl)) + ')'; }).join(', ') + '</div></div>';
    }
    html += '<div class="minggu">' + kartu + '</div></section>';
    // 5. Proyeksi (5 bulan; jumlah baris mengikuti data dari server)
    var nPr = s.proyeksi.length;
    html += '<section><div class="sec-h"><div class="t"><h2>Proyeksi ' + nPr + ' bulan</h2><p>Bulan berjalan dan ' + (nPr - 1) + ' bulan berikutnya</p></div></div>' +
      '<div class="card"><div class="tbl-w"><table class="tbl"><thead><tr><th>Bulan</th><th class="r">Saldo awal</th><th class="r">Pemasukan</th><th class="r">Pengeluaran</th><th class="r">Cicilan</th><th class="r">Saldo akhir</th></tr></thead><tbody>' +
      s.proyeksi.map(function (r) {
        return '<tr class="' + (r.berjalan ? 'sorot' : '') + '"><td>' + esc(KB.bulanPendek(r.bulan)) + (r.berjalan ? ' <span class="pill info">Berjalan</span>' : '') + '</td>' +
          '<td class="r">' + uang(r.saldoAwal) + '</td><td class="r plus">' + uang(r.pemasukan) + '</td><td class="r minus">' + uang(r.pengeluaran) + '</td>' +
          '<td class="r">' + uang(r.cicilan) + '</td><td class="r"><b class="' + (r.saldoAkhir < 0 ? 'minus' : '') + '">' + uang(r.saldoAkhir) + '</b></td></tr>';
      }).join('') + '</tbody></table></div></div></section>';
    // 6. Transaksi terbaru (maks. 5)
    var terbaru = (s.terbaru || []).slice(0, MAKS_TERBARU);
    html += '<section><div class="sec-h"><div class="t"><h2>Transaksi terbaru</h2><p>' + terbaru.length + ' catatan terakhir</p></div></div><div class="card list">' +
      (terbaru.length ? terbaru.map(function (x) {
        var k = ikonJenis(x.jenis), masuk = x.jenis === 'Pemasukan';
        return '<div class="trow"><div class="ico" style="background:' + k[1] + ';color:' + k[2] + '">' + ic(k[0]) + '</div>' +
          '<div class="t"><b>' + esc(x.kat) + '</b><small>' + esc(KB.tgl(x.tgl)) + (x.ket ? ' · ' + esc(x.ket) : '') + '</small></div>' +
          '<div class="n ' + (masuk ? 'plus' : 'minus') + '">' + uang(x.nom, '', masuk ? '+' : '-') + '</div></div>';
      }).join('') : '<div class="kosong">' + ic('receipt_long') + '<b>Belum ada transaksi</b></div>') + '</div></section>';
    root.innerHTML = html;
    document.getElementById('foot').textContent = '© 2026 Kas Bandhits by Fajar Ferdian K. Seluruh hak cipta dilindungi';
  }
  // Buka/tutup satu minggu tanpa menggambar ulang halaman.
  function toggleMinggu(h) {
    var kartu = h.closest('.mg'), i = kartu.getAttribute('data-mg'), isi = kartu.querySelector('.mg-isi');
    var buka = h.getAttribute('aria-expanded') !== 'true';
    h.setAttribute('aria-expanded', String(buka)); isi.hidden = !buka;
    kartu.classList.toggle('tutup', !buka);
    kartu.classList.toggle('desak', !buka && !!kartu.querySelector('.it.dekat, .it.telat'));
    if (mgPilih) { mgPilih.buka[i] = buka; KB.ls.set('kb_pub_mg', mgPilih); }
  }
  root.addEventListener('click', function (e) { var h = e.target.closest('.mg-h'); if (h) toggleMinggu(h); });
  root.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('mg-h')) { e.preventDefault(); toggleMinggu(e.target); }
  });

  var Hari = { mingguKe: function (t) { var d = +t.slice(8, 10); return d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : 3; } };

  function pesan(ikon, judul, isi, tombol) {
    root.innerHTML = '<div class="card"><div class="kosong" style="padding:48px 20px">' + ic(ikon, 's32') + '<b>' + esc(judul) + '</b><p>' + esc(isi) + '</p>' +
      (tombol ? '<button class="btn pri mt8" id="ulang" type="button">' + ic('refresh') + 'Coba lagi</button>' : '') + '</div></div>';
    var b = document.getElementById('ulang'); if (b) b.addEventListener('click', function () { ambil(true); });
  }

  function ambil(paksa) {
    if (sibuk || (!paksa && Date.now() - terakhirAmbil < 60000)) return;
    sibuk = true; setStatus('Memperbarui…', 'kirim');
    KB.apiGet({ action: 'publik' }).then(function (j) {
      terakhirAmbil = Date.now();
      KB.ls.set('kb_pub', { t: Date.now(), s: j.r });
      render(j.r); setStatus('Terbaru');
    }).catch(function (e) {
      var simpan = KB.ls.get('kb_pub', null);
      if (e.code === 'PUBLIK_OFF') { KB.ls.del('kb_pub'); pesan('visibility_off', 'Halaman publik dinonaktifkan', 'Pemilik sedang menutup ringkasan ini.'); setStatus('Nonaktif', 'tunda'); }
      else if (simpan) { setStatus('Offline · data ' + KB.jamLalu(new Date(simpan.t).toISOString()), 'tunda'); }
      else { pesan('cloud_off', 'Data belum bisa dimuat', e.message, true); setStatus('Gagal', 'galat'); }
    }).finally(function () { sibuk = false; });
  }

  // Tampil instan dari salinan lokal, lalu segarkan.
  var simpan = KB.ls.get('kb_pub', null);
  if (simpan && simpan.s) { try { render(simpan.s); setStatus('Memperbarui…', 'kirim'); } catch (e) { } }
  if (!KB.siap) pesan('settings', 'Konfigurasi belum lengkap', 'Isi GAS_URL di js/config.js dengan alamat /exec Apps Script.');
  else ambil(true);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') ambil(false); });
  setInterval(function () { if (document.visibilityState === 'visible') ambil(false); }, 300000);
  status.addEventListener('click', function () { ambil(true); });

  var tb = document.getElementById('pasang');
  function cekPasang() { tb.hidden = !KB.pasang.siap; }
  document.addEventListener('kb:pasang', cekPasang);
  tb.addEventListener('click', function () { KB.pasangSekarang().then(cekPasang); });
  KB.daftarSW();
})();
