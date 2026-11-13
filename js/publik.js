/* =====================================================================
 * KAS BANDHITS — Halaman publik (hanya baca, tanpa login)
 * Enam bagian: saldo kas, pemasukan & pengeluaran bulan berjalan,
 * pengingat jatuh tempo per minggu, proyeksi 3 bulan, transaksi terbaru.
 * Tampil instan dari salinan lokal, lalu diperbarui dari server.
 * ===================================================================== */
(function () {
  'use strict';
  var KB = window.KB, esc = KB.esc, ic = KB.ic, uang = KB.uang;
  var root = document.getElementById('pub'), status = document.getElementById('status');
  var terakhirAmbil = 0, sibuk = false;

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
    html += '<section class="card hero metric" aria-label="Saldo kas">' +
      '<div class="top"><span class="lbl">Saldo kas saat ini</span><span class="pill info" style="background:rgba(255,255,255,.08);color:#9EE6E5">' + ic('verified', 's16') + 'Per ' + esc(KB.tglPendek(hari)) + '</span></div>' +
      '<div class="v">' + uang(s.saldoKas) + '</div>' +
      '<div class="foot">Transaksi bertanggal sampai hari ini · ' + esc(KB.tglPanjang(hari)) + '</div></section>';
    // 2–3. Pemasukan & pengeluaran bulan berjalan
    html += '<section class="grid g2">' +
      '<div class="card metric"><div class="top"><span class="lbl">Pemasukan ' + esc(KB.bulan(kini)) + '</span><span class="ibox" style="color:var(--green-d)">' + ic('south_west') + '</span></div>' +
      '<div class="v plus">' + uang(s.bulan.pemasukan) + '</div><div class="foot">' + s.bulan.jmlPemasukan + ' transaksi s.d. hari ini</div></div>' +
      '<div class="card metric"><div class="top"><span class="lbl">Pengeluaran ' + esc(KB.bulan(kini)) + '</span><span class="ibox" style="color:var(--red-d)">' + ic('north_east') + '</span></div>' +
      '<div class="v minus">' + uang(s.bulan.pengeluaran) + '</div><div class="foot">' + s.bulan.jmlPengeluaran + ' transaksi' +
      (s.bulan.cicilan ? ' · termasuk cicilan ' + uang(s.bulan.cicilan) : '') + '</div></div></section>';
    // 4. Pengingat jatuh tempo per minggu
    var pg = s.pengingat, mingguKini = Hari.mingguKe(hari);
    html += '<section><div class="sec-h"><div class="t"><h2>Pengingat jatuh tempo</h2><p>Cicilan ' + esc(KB.bulan(kini)) + ' per minggu</p></div>' +
      '<span class="pill ' + (pg.sisaBulan ? 'warn' : 'ok') + '">' + (pg.sisaBulan ? 'Belum dibayar ' + KB.rp(pg.sisaBulan) : 'Semua terbayar') + '</span></div>';
    if (pg.tunggakan.length) {
      html += '<div class="note bad mb12">' + ic('warning') + '<div><b>Tunggakan bulan sebelumnya: ' + uang(pg.totalTunggakan) + '</b><br>' +
        pg.tunggakan.map(function (t) { return esc(t.pihak) + ' cicilan ke-' + t.ke + ' (' + esc(KB.tglPendek(t.tgl)) + ')'; }).join(', ') + '</div></div>';
    }
    html += '<div class="minggu">' + pg.minggu.map(function (m, i) {
      var items = m.items.length ? m.items.map(function (it) {
        return '<div class="it ' + (it.lunas ? 'lunas' : '') + '"><div class="row"><b style="font-size:13px">' + esc(it.pihak) + '</b><span class="sp"></span>' +
          (it.lunas ? '<span class="pill ok">' + ic('check', 's16') + 'Lunas</span>' : '<span class="pill ' + (it.tgl < hari ? 'bad' : 'warn') + '">' + esc(KB.tglPendek(it.tgl)) + '</span>') + '</div>' +
          '<div class="row"><small class="muted">Cicilan ' + it.ke + '/' + it.dari + '</small><span class="sp"></span>' + uang(it.lunas ? it.nominal : it.sisa) + '</div></div>';
      }).join('') : '<div class="kosong" style="padding:14px 4px">' + ic(i < mingguKini ? 'task_alt' : 'event_available') + '<small>Tidak ada jadwal</small></div>';
      return '<div class="card mg ' + (i === mingguKini ? 'kini' : '') + '"><div class="row"><span class="lbl">Minggu ' + m.ke + '</span><span class="sp"></span><small class="mono muted">' +
        +m.dari.slice(8) + '–' + +m.sampai.slice(8) + ' ' + KB.BLN[+m.dari.slice(5, 7) - 1] + '</small></div>' + items +
        (m.items.length ? '<div class="row" style="margin-top:auto"><small class="muted">Total</small><span class="sp"></span><b>' + uang(m.total) + '</b></div>' : '') + '</div>';
    }).join('') + '</div></section>';
    // 5. Proyeksi 3 bulan
    html += '<section><div class="sec-h"><div class="t"><h2>Proyeksi 3 bulan</h2><p>Bulan berjalan dan dua bulan berikutnya</p></div></div>' +
      '<div class="card"><div class="tbl-w"><table class="tbl"><thead><tr><th>Bulan</th><th class="r">Saldo awal</th><th class="r">Pemasukan</th><th class="r">Pengeluaran</th><th class="r">Cicilan</th><th class="r">Saldo akhir</th></tr></thead><tbody>' +
      s.proyeksi.map(function (r) {
        return '<tr class="' + (r.berjalan ? 'sorot' : '') + '"><td>' + esc(KB.bulanPendek(r.bulan)) + (r.berjalan ? ' <span class="pill info">Berjalan</span>' : '') + '</td>' +
          '<td class="r">' + uang(r.saldoAwal) + '</td><td class="r plus">' + uang(r.pemasukan) + '</td><td class="r minus">' + uang(r.pengeluaran) + '</td>' +
          '<td class="r">' + uang(r.cicilan) + '</td><td class="r"><b class="' + (r.saldoAkhir < 0 ? 'minus' : '') + '">' + uang(r.saldoAkhir) + '</b></td></tr>';
      }).join('') + '</tbody></table></div></div></section>';
    // 6. Transaksi terbaru
    html += '<section><div class="sec-h"><div class="t"><h2>Transaksi terbaru</h2><p>' + s.terbaru.length + ' catatan terakhir</p></div></div><div class="card list">' +
      (s.terbaru.length ? s.terbaru.map(function (x) {
        var k = ikonJenis(x.jenis), masuk = x.jenis === 'Pemasukan';
        return '<div class="trow"><div class="ico" style="background:' + k[1] + ';color:' + k[2] + '">' + ic(k[0]) + '</div>' +
          '<div class="t"><b>' + esc(x.kat) + '</b><small>' + esc(KB.tgl(x.tgl)) + (x.ket ? ' · ' + esc(x.ket) : '') + '</small></div>' +
          '<div class="n ' + (masuk ? 'plus' : 'minus') + '">' + uang(x.nom, '', masuk ? '+' : '-') + '</div></div>';
      }).join('') : '<div class="kosong">' + ic('receipt_long') + '<b>Belum ada transaksi</b></div>') + '</div></section>';
    root.innerHTML = html;
    document.getElementById('foot').textContent = 'Data dari Google Sheets pemilik' + (s.meta && s.meta.diperbarui ? ' · dihitung ' + KB.jamLalu(s.meta.diperbarui) : '');
  }
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
