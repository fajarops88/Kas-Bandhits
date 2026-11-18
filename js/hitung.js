/* =====================================================================
 * KAS BANDHITS — Modul Hitung Bersama
 * ---------------------------------------------------------------------
 * Satu sumber logika untuk BACKEND (disalin menjadi Hitung.gs) dan
 * FRONTEND (js/hitung.js). Fungsi murni: tidak menyentuh DOM, Sheets,
 * maupun jam sistem — tanggal "hari ini" selalu dikirim sebagai parameter
 * berformat 'yyyy-mm-dd' supaya server dan browser menghasilkan angka sama.
 *
 * Aturan yang diterapkan (PRD):
 *  R5  Saldo kas = transaksi bertanggal s.d. hari ini. Transaksi bertanggal
 *      ke depan hanya dihitung di bulannya (tidak dihitung dua kali).
 *  R6  Cicilan tanpa bunga: cicilan = floor(nominal / jangka), cicilan
 *      terakhir menyerap sisa pembulatan. Status dari TOTAL NOMINAL dibayar.
 *      Jatuh tempo tanggal 29–31 dijepit ke hari terakhir bulan.
 *  R11 Transaksi berulang hanya dipakai proyeksi, mulai bulan berikutnya,
 *      dan dilewati bila bulan itu sudah ada transaksi tercatat yang sama
 *      (jenis + kategori + nominal).
 * ===================================================================== */
var Hitung = (function () {
  'use strict';

  /* ---------------- util tanggal (string yyyy-mm-dd) ---------------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function hariAkhir(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); } // m: 1..12
  function tglValid(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
    var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    return m >= 1 && m <= 12 && d >= 1 && d <= hariAkhir(y, m);
  }
  function bulanValid(s) { return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s)); }
  function bk(s) { return String(s).slice(0, 7); }
  function geserBulan(key, n) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7) - 1 + n;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + pad(m + 1);
  }
  /** Tambah n bulan; hari dijepit ke hari terakhir bulan tujuan (31 Jan +1 = 28/29 Feb). */
  function tambahBulan(tgl, n, hariAsal) {
    var key = geserBulan(bk(tgl), n), y = +key.slice(0, 4), m = +key.slice(5, 7);
    var d = Math.min(hariAsal || +tgl.slice(8, 10), hariAkhir(y, m));
    return key + '-' + pad(d);
  }
  function keHari(tgl) { return Date.UTC(+tgl.slice(0, 4), +tgl.slice(5, 7) - 1, +tgl.slice(8, 10)) / 86400000; }
  function selisihHari(dari, ke) { return keHari(ke) - keHari(dari); }
  function tambahHari(tgl, n) {
    var d = new Date((keHari(tgl) + n) * 86400000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function idWaktu(id) { var m = /-(\d{10,14})-/.exec(String(id)); return m ? +m[1] : 0; }
  function urutTerbaru(a, b) { return a.tgl < b.tgl ? 1 : a.tgl > b.tgl ? -1 : idWaktu(b.id) - idWaktu(a.id); }
  function sama(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
  function jumlah(arr) { var s = 0; for (var i = 0; i < arr.length; i++) s += num(arr[i].nom); return s; }

  /* ---------------- R6: jadwal & status pinjaman ---------------- */
  function bayarPer(data) {
    var map = {};
    (data.bayar || []).forEach(function (b) { (map[b.pid] = map[b.pid] || []).push(b); });
    return map;
  }

  /**
   * @param p  pinjaman {id,tgl,pihak,ket,nom,tempo,jangka}
   * @param daftarBayar pembayaran milik pinjaman ini
   * @param hariIni 'yyyy-mm-dd'
   */
  function jadwalPinjaman(p, daftarBayar, hariIni) {
    var n = Math.max(1, Math.floor(num(p.jangka)) || 1);
    var nom = Math.max(0, Math.round(num(p.nom)));
    var reguler = Math.floor(nom / n);
    var riwayat = (daftarBayar || []).slice().sort(function (a, b) { return a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : idWaktu(a.id) - idWaktu(b.id); });
    var dibayar = jumlah(riwayat);
    var tempo = tglValid(p.tempo) ? p.tempo : p.tgl;
    var hariAsal = +tempo.slice(8, 10);
    var cicilan = [], kum = 0, berikut = null;
    for (var i = 0; i < n; i++) {
      var amt = i < n - 1 ? reguler : nom - reguler * (n - 1);
      var terbayar = Math.max(0, Math.min(amt, dibayar - kum));
      kum += amt;
      var c = { ke: i + 1, tgl: tambahBulan(tempo, i, hariAsal), nominal: amt, terbayar: terbayar, sisa: amt - terbayar };
      c.lunas = c.sisa <= 0;
      if (!c.lunas && !berikut) berikut = c;
      cicilan.push(c);
    }
    var sisa = Math.max(0, nom - dibayar);
    var status = 'Aktif', hariLagi = null;
    if (sisa <= 0 || !berikut) { status = 'Lunas'; berikut = null; }
    else if (hariIni) {
      hariLagi = selisihHari(hariIni, berikut.tgl);
      status = hariLagi < 0 ? 'Terlambat' : hariLagi <= 7 ? 'Segera' : 'Aktif';
    }
    var lunasKe = cicilan.filter(function (c) { return c.lunas; }).length;
    return {
      id: p.id, tgl: p.tgl, pihak: p.pihak, ket: p.ket || '', nom: nom, tempo: tempo, jangka: n,
      cicilanPerBulan: reguler || nom, cicilanTerakhir: cicilan[n - 1].nominal,
      cicilan: cicilan, dibayar: dibayar, sisa: sisa, lunasKe: lunasKe,
      persen: nom > 0 ? Math.min(100, Math.round(dibayar / nom * 1000) / 10) : 100,
      berikut: berikut, status: status, hariLagi: hariLagi,
      tglLunas: cicilan[n - 1].tgl, riwayat: riwayat
    };
  }

  function semuaPinjaman(data, hariIni) {
    var map = bayarPer(data);
    return (data.pinjaman || []).map(function (p) { return jadwalPinjaman(p, map[p.id] || [], hariIni); });
  }

  /* ---------------- R5: saldo & ringkasan ---------------- */
  function saldoKas(data, hariIni) {
    var s = 0;
    (data.pemasukan || []).forEach(function (x) { if (x.tgl <= hariIni) s += num(x.nom); });
    (data.pengeluaran || []).forEach(function (x) { if (x.tgl <= hariIni) s -= num(x.nom); });
    (data.bayar || []).forEach(function (x) { if (x.tgl <= hariIni) s -= num(x.nom); });
    return s;
  }

  /** Total sebuah bulan. sampai = batas tanggal (opsional, inklusif). */
  function totalBulan(data, key, sampai) {
    function ok(x) { return bk(x.tgl) === key && (!sampai || x.tgl <= sampai); }
    var pem = (data.pemasukan || []).filter(ok), pen = (data.pengeluaran || []).filter(ok), bay = (data.bayar || []).filter(ok);
    return {
      bulan: key, pemasukan: jumlah(pem), pengeluaranMurni: jumlah(pen), cicilan: jumlah(bay),
      pengeluaran: jumlah(pen) + jumlah(bay), jmlPemasukan: pem.length, jmlPengeluaran: pen.length + bay.length
    };
  }

  /* ---------------- R11: transaksi berulang ---------------- */
  /* Frekuensi: 'Bulanan' (bawaan, juga bila kosong), 'Tahunan' (sekali setahun di bulan `bln`, mis. Gaji 13 di Juni),
     'Idul Fitri' (sekali per Idul Fitri, `sebelum` hari sebelum hari raya, mis. THR). */
  var FREK = ['Bulanan', 'Tahunan', 'Idul Fitri'];
  /* Tanggal 1 Syawal (Idul Fitri) di Indonesia. 2026: Kemenag (sidang isbat). 2027: SKB 3 Menteri libur nasional 2027
     (tetap menunggu sidang isbat). 2028 dst.: PERKIRAAN kalender Umm al-Qura; tanggal resmi Indonesia bisa ±1 hari,
     koreksi lewat pengaturan `idul_fitri`. 2033 memuat dua Idul Fitri (1454 H & 1455 H). */
  var IDUL_FITRI = ['2026-03-21', '2027-03-10', '2028-02-26', '2029-02-14', '2030-02-04', '2031-01-24', '2032-01-14',
    '2033-01-02', '2033-12-23', '2034-12-12', '2035-12-01', '2036-11-19'];
  /** Daftar tanggal Idul Fitri yang dipakai: bawaan, lalu tahun yang dikoreksi pemilik (set.idul_fitri) diganti seluruhnya. */
  function tanggalIdulFitri(data) {
    var koreksi = String((data && data.set && data.set.idul_fitri) || '').split(',').map(function (x) { return x.trim(); }).filter(tglValid);
    var thn = {}; koreksi.forEach(function (t) { thn[t.slice(0, 4)] = 1; });
    var semua = IDUL_FITRI.filter(function (t) { return !thn[t.slice(0, 4)]; }).concat(koreksi);
    return semua.filter(function (t, i) { return semua.indexOf(t) === i; }).sort();
  }
  function frekBerulang(b) { return FREK.indexOf(b && b.frek) > -1 ? b.frek : 'Bulanan'; }
  /** Status hidup (saklar aktif, rentang mulai–selesai, nominal), tanpa melihat apakah jatuh di bulan `key`. */
  function berulangHidup(b, key) {
    if (!(b.aktif === true || b.aktif === 'TRUE' || b.aktif === 1 || b.aktif === '1')) return false;
    if (!bulanValid(b.mulai) || key < b.mulai) return false;
    if (b.selesai && bulanValid(b.selesai) && key > b.selesai) return false;
    return num(b.nom) > 0;
  }
  /** Tanggal kejadian butir berulang di bulan `key`, atau null bila bulan itu tidak ada kejadian. */
  function tglBerulang(b, key, data) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7), f = frekBerulang(b);
    if (f === 'Idul Fitri') {
      var geser = Math.min(Math.max(0, Math.floor(num(b.sebelum))), 60), daftar = tanggalIdulFitri(data);
      for (var i = 0; i < daftar.length; i++) { var t = tambahHari(daftar[i], -geser); if (bk(t) === key) return t; }
      return null;
    }
    if (f === 'Tahunan' && Math.floor(num(b.bln)) !== m) return null;
    return key + '-' + pad(Math.min(Math.max(1, Math.floor(num(b.hari)) || 1), hariAkhir(y, m)));
  }
  /** Butir berulang dihitung di bulan `key`: hidup DAN ada kejadian di bulan itu. */
  function berulangAktif(b, key, data) { return berulangHidup(b, key) && tglBerulang(b, key, data) !== null; }
  /** Kejadian berikutnya mulai bulan `dariKey` (maks. 3 tahun ke depan), untuk tampilan admin. */
  function berulangBerikut(b, dariKey, data) {
    for (var i = 0; i < 40; i++) {
      var key = geserBulan(dariKey, i);
      if (b.selesai && bulanValid(b.selesai) && key > b.selesai) return null;
      if (key < b.mulai) continue;
      var t = tglBerulang(b, key, data); if (t) return t;
    }
    return null;
  }
  /** Butir berulang yang benar-benar menambah proyeksi di bulan `key` (sudah dikurangi yang cocok). */
  function berulangBulan(data, key) {
    var tercatat = {
      Pemasukan: (data.pemasukan || []).filter(function (x) { return bk(x.tgl) === key; }).slice(),
      Pengeluaran: (data.pengeluaran || []).filter(function (x) { return bk(x.tgl) === key; }).slice()
    };
    var hasil = [];
    (data.berulang || []).forEach(function (b) {
      if (!berulangAktif(b, key, data)) return;
      var daftar = tercatat[b.jenis] || [];
      var idx = -1;
      for (var i = 0; i < daftar.length; i++) {
        if (sama(daftar[i].kat, b.kat) && Math.round(num(daftar[i].nom)) === Math.round(num(b.nom))) { idx = i; break; }
      }
      if (idx > -1) { daftar.splice(idx, 1); return; }          // sudah tercatat → jangan dihitung dua kali
      hasil.push({ id: b.id, jenis: b.jenis, kat: b.kat, ket: b.ket || '', nom: num(b.nom), tgl: tglBerulang(b, key, data), frek: frekBerulang(b) });
    });
    return hasil;
  }

  /* ---------------- Proyeksi saldo (R5 + R6 + R11) ---------------- */
  function proyeksi(data, hariIni, nBulan) {
    nBulan = nBulan || 36;
    var kini = bk(hariIni), saldo = saldoKas(data, hariIni);
    var depan = {};
    function tambah(key, f, v) { (depan[key] = depan[key] || { pem: 0, pen: 0, cic: 0 })[f] += v; }
    (data.pemasukan || []).forEach(function (x) { if (x.tgl > hariIni) tambah(bk(x.tgl), 'pem', num(x.nom)); });
    (data.pengeluaran || []).forEach(function (x) { if (x.tgl > hariIni) tambah(bk(x.tgl), 'pen', num(x.nom)); });
    (data.bayar || []).forEach(function (x) { if (x.tgl > hariIni) tambah(bk(x.tgl), 'cic', num(x.nom)); });
    var tunggakan = 0;
    semuaPinjaman(data, hariIni).forEach(function (j) {
      j.cicilan.forEach(function (c) {
        if (c.sisa <= 0) return;
        var key = bk(c.tgl);
        if (key < kini) { tunggakan += c.sisa; key = kini; }      // tunggakan ditagih di bulan berjalan
        tambah(key, 'cic', c.sisa);
      });
    });
    var baris = [], awal = saldo;
    for (var i = 0; i < nBulan; i++) {
      var key = geserBulan(kini, i), d = depan[key] || { pem: 0, pen: 0, cic: 0 };
      var rIn = 0, rOut = 0;
      if (i > 0) {
        berulangBulan(data, key).forEach(function (r) { if (r.jenis === 'Pemasukan') rIn += r.nom; else rOut += r.nom; });
      }
      var pem = d.pem + rIn, pen = d.pen + rOut, cic = d.cic;
      var akhir = awal + pem - pen - cic;
      baris.push({
        bulan: key, berjalan: i === 0, saldoAwal: awal, pemasukan: pem, pengeluaran: pen, cicilan: cic,
        saldoAkhir: akhir, berulangMasuk: rIn, berulangKeluar: rOut, tunggakan: i === 0 ? tunggakan : 0
      });
      awal = akhir;
    }
    return baris;
  }

  /* ---------------- Pengingat jatuh tempo ---------------- */
  function mingguKe(tgl) { var d = +tgl.slice(8, 10); return d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : 3; }
  function rentangMinggu(key) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7), akhir = hariAkhir(y, m);
    return [[1, 7], [8, 14], [15, 21], [22, akhir]];
  }
  function itemCicilan(j, c, hariIni) {
    return {
      pid: j.id, pihak: j.pihak, ket: j.ket, ke: c.ke, dari: j.jangka, tgl: c.tgl, nominal: c.nominal, sisa: c.sisa,
      lunas: c.lunas, hariLagi: selisihHari(hariIni, c.tgl)
    };
  }
  /** Cicilan bulan berjalan per minggu + tunggakan bulan sebelumnya + jendela 7 hari. */
  function pengingat(data, hariIni) {
    var kini = bk(hariIni), minggu = rentangMinggu(kini).map(function (r, i) {
      return { ke: i + 1, dari: kini + '-' + pad(r[0]), sampai: kini + '-' + pad(r[1]), items: [] };
    });
    var tunggakan = [], tujuhHari = [];
    semuaPinjaman(data, hariIni).forEach(function (j) {
      j.cicilan.forEach(function (c) {
        var it = itemCicilan(j, c, hariIni), key = bk(c.tgl);
        if (key === kini) minggu[mingguKe(c.tgl)].items.push(it);
        else if (key < kini && !c.lunas) tunggakan.push(it);
        if (!c.lunas && it.hariLagi <= 7) tujuhHari.push(it);
      });
    });
    function urut(a, b) { return a.tgl < b.tgl ? -1 : a.tgl > b.tgl ? 1 : 0; }
    minggu.forEach(function (m) {
      m.items.sort(urut);
      m.total = m.items.reduce(function (s, x) { return s + x.nominal; }, 0);
      m.sisa = m.items.reduce(function (s, x) { return s + x.sisa; }, 0);
    });
    tunggakan.sort(urut); tujuhHari.sort(urut);
    return {
      bulan: kini, minggu: minggu, tunggakan: tunggakan, tujuhHari: tujuhHari,
      totalBulan: minggu.reduce(function (s, m) { return s + m.total; }, 0),
      sisaBulan: minggu.reduce(function (s, m) { return s + m.sisa; }, 0),
      totalTunggakan: tunggakan.reduce(function (s, x) { return s + x.sisa; }, 0),
      total7: tujuhHari.reduce(function (s, x) { return s + x.sisa; }, 0)
    };
  }

  /* ---------------- Transaksi gabungan ---------------- */
  function gabung(data) {
    var nama = {};
    (data.pinjaman || []).forEach(function (p) { nama[p.id] = p.pihak; });
    var out = [];
    (data.pemasukan || []).forEach(function (x) { out.push({ id: x.id, jenis: 'Pemasukan', tgl: x.tgl, kat: x.kat, ket: x.ket || '', nom: num(x.nom) }); });
    (data.pengeluaran || []).forEach(function (x) { out.push({ id: x.id, jenis: 'Pengeluaran', tgl: x.tgl, kat: x.kat, ket: x.ket || '', nom: num(x.nom) }); });
    (data.bayar || []).forEach(function (x) {
      var pihak = nama[x.pid] || x.pihak || '';
      out.push({ id: x.id, jenis: 'Cicilan', tgl: x.tgl, kat: /^cicilan\b/i.test(pihak) ? pihak : 'Cicilan ' + pihak, ket: x.ket || '', nom: num(x.nom), pid: x.pid });
    });
    return out.sort(urutTerbaru);
  }
  function terbaru(data, hariIni, n) {
    return gabung(data).filter(function (x) { return x.tgl <= hariIni; }).slice(0, n || 10);
  }

  /* ---------------- Laporan ---------------- */
  function kunciPeriode(tgl, periode) {
    if (periode === 'harian') return tgl;
    if (periode === 'tahunan') return tgl.slice(0, 4);
    if (periode === 'mingguan') {                          // Senin sebagai awal minggu
      var dow = (Math.floor(keHari(tgl)) + 3) % 7;         // 1970-01-01 = Kamis → Senin = 0
      return tambahHari(tgl, -dow);
    }
    return bk(tgl);
  }
  function laporan(data, opsi) {
    opsi = opsi || {};
    var dari = opsi.dari || '0000-01-01', sampai = opsi.sampai || '9999-12-31', periode = opsi.periode || 'bulanan';
    var q = String(opsi.cari || '').trim().toLowerCase();
    var rows = gabung(data).filter(function (x) {
      if (x.tgl < dari || x.tgl > sampai) return false;
      if (opsi.jenis && opsi.jenis !== 'Semua' && x.jenis !== opsi.jenis) return false;
      if (opsi.kat && !sama(x.kat, opsi.kat)) return false;
      if (q && (x.kat + ' ' + x.ket + ' ' + x.nom).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var grup = {}, kat = {}, tot = { pemasukan: 0, pengeluaran: 0, cicilan: 0 };
    rows.forEach(function (x) {
      var k = kunciPeriode(x.tgl, periode);
      var g = grup[k] = grup[k] || { kunci: k, pemasukan: 0, pengeluaran: 0, cicilan: 0, jumlah: 0 };
      var f = x.jenis === 'Pemasukan' ? 'pemasukan' : x.jenis === 'Cicilan' ? 'cicilan' : 'pengeluaran';
      g[f] += x.nom; g.jumlah++; tot[f] += x.nom;
      var kk = x.jenis + '|' + x.kat;
      var kt = kat[kk] = kat[kk] || { jenis: x.jenis, kat: x.kat, total: 0, jumlah: 0 };
      kt.total += x.nom; kt.jumlah++;
    });
    var daftar = Object.keys(grup).sort().reverse().map(function (k) {
      var g = grup[k]; g.bersih = g.pemasukan - g.pengeluaran - g.cicilan; return g;
    });
    return {
      rows: rows, grup: daftar,
      kategori: Object.keys(kat).map(function (k) { return kat[k]; }).sort(function (a, b) { return b.total - a.total; }),
      total: { pemasukan: tot.pemasukan, pengeluaran: tot.pengeluaran, cicilan: tot.cicilan,
        bersih: tot.pemasukan - tot.pengeluaran - tot.cicilan, jumlah: rows.length }
    };
  }

  /* ---------------- Kalender ---------------- */
  function kalender(data, key, hariIni) {
    var ev = {};
    function add(tgl, e) { (ev[tgl] = ev[tgl] || []).push(e); }
    semuaPinjaman(data, hariIni).forEach(function (j) {
      j.cicilan.forEach(function (c) {
        if (bk(c.tgl) !== key) return;
        add(c.tgl, { tipe: 'cicilan', pid: j.id, judul: j.pihak, nominal: c.nominal, sisa: c.sisa, lunas: c.lunas, ke: c.ke, dari: j.jangka, tgl: c.tgl });
      });
    });
    (data.berulang || []).forEach(function (b) {
      if (!berulangAktif(b, key, data)) return;
      var t = tglBerulang(b, key, data);
      add(t, { tipe: 'berulang', id: b.id, jenis: b.jenis, judul: b.ket || b.kat, kat: b.kat, nominal: num(b.nom), tgl: t });
    });
    return ev;
  }

  /* ---------------- Snapshot halaman publik (allowlist R8) ---------------- */
  /** Bagian yang disembunyikan pemilik bernilai null: datanya tidak dihitung dan tidak dikirim. */
  function publik(data, hariIni) {
    var kini = bk(hariIni), sem = String((data && data.set && data.set.publik_sembunyi) || '').split(',');
    function tampil(k) { return sem.indexOf(k) < 0; }
    function bersih(it) { return { pihak: it.pihak, ke: it.ke, dari: it.dari, tgl: it.tgl, nominal: it.nominal, sisa: it.sisa, lunas: it.lunas }; }
    var tb = tampil('kpi') ? totalBulan(data, kini, hariIni) : null, pg = tampil('tempo') ? pengingat(data, hariIni) : null;
    return {
      hariIni: hariIni,
      saldoKas: tampil('saldo') ? saldoKas(data, hariIni) : null,
      bulan: tb && { kunci: kini, pemasukan: tb.pemasukan, pengeluaran: tb.pengeluaran, cicilan: tb.cicilan,
        jmlPemasukan: tb.jmlPemasukan, jmlPengeluaran: tb.jmlPengeluaran },
      pengingat: pg && {
        minggu: pg.minggu.map(function (m) { return { ke: m.ke, dari: m.dari, sampai: m.sampai, total: m.total, sisa: m.sisa, items: m.items.map(bersih) }; }),
        tunggakan: pg.tunggakan.map(bersih), totalBulan: pg.totalBulan, sisaBulan: pg.sisaBulan, totalTunggakan: pg.totalTunggakan,
        // Cicilan bulan depan yang jatuh tempo ≤ 7 hari lagi (menjelang akhir bulan), belum lunas
        bulanDepan: pg.tujuhHari.filter(function (it) { return bk(it.tgl) > kini && it.hariLagi >= 0; }).map(bersih)
      },
      proyeksi: tampil('proyeksi') ? proyeksi(data, hariIni, 5).map(function (r) {
        return { bulan: r.bulan, berjalan: r.berjalan, saldoAwal: r.saldoAwal, pemasukan: r.pemasukan, pengeluaran: r.pengeluaran, cicilan: r.cicilan, saldoAkhir: r.saldoAkhir };
      }) : null,
      terbaru: tampil('terbaru') ? terbaru(data, hariIni, 5).map(function (x) { return { tgl: x.tgl, jenis: x.jenis, kat: x.kat, ket: x.ket, nom: x.nom }; }) : null,
      katMasuk: tampil('kat_masuk') ? katTerbesar(data, 'Pemasukan', kini, hariIni, 5) : null,
      katKeluar: tampil('kat_keluar') ? katTerbesar(data, 'Pengeluaran', kini, hariIni, 5) : null,
      keinginan: keinginanPublik(data)
    };
  }

  /** Kategori terbesar bulan `key` s.d. `sampai` (pemasukan atau pengeluaran tercatat; pembayaran cicilan tidak termasuk,
   *  sama seperti Dashboard admin). persen = bagian dari total bulan itu, dibulatkan; total sendiri tidak dikirim.
   *  Ikon & warna diambil dari tabel Kategori dan disaring supaya aman disisipkan ke HTML. */
  function katTerbesar(data, tipe, key, sampai, n) {
    var arr = (tipe === 'Pemasukan' ? data.pemasukan : data.pengeluaran) || [], per = {}, nama = {}, tot = 0;
    arr.forEach(function (x) {
      if (bk(x.tgl) !== key || (sampai && x.tgl > sampai)) return;
      var v = num(x.nom), k = String(x.kat || 'Lainnya').trim(), kk = k.toLowerCase();
      if (!v) return;
      per[kk] = (per[kk] || 0) + v; if (!nama[kk]) nama[kk] = k; tot += v;
    });
    var meta = {};
    (data.kategori || []).forEach(function (k) { if (k.tipe === tipe) meta[String(k.nama || '').trim().toLowerCase()] = k; });
    return Object.keys(per).sort(function (a, b) { return per[b] - per[a] || (a > b ? 1 : -1); }).slice(0, n || 5).map(function (kk) {
      var m = meta[kk] || {}, cicil = /^cicilan\b/.test(kk);
      return {
        nama: m.nama ? String(m.nama).trim() : nama[kk], nominal: per[kk], persen: tot ? Math.round(per[kk] / tot * 100) : 0,
        ikon: /^[a-z0-9_]{2,40}$/.test(String(m.ikon || '')) ? m.ikon : cicil ? 'account_balance' : tipe === 'Pemasukan' ? 'south_west' : 'north_east',
        warna: /^#[0-9a-fA-F]{6}$/.test(String(m.warna || '')) ? m.warna : cicil ? '#0E9594' : '#667085'
      };
    });
  }

  /** Keinginan & hajatan untuk halaman publik (hanya baca): aktif per prioritas sesuai urutan, plus 5 yang terakhir tercapai.
   *  Hanya butir yang diizinkan tampil (publik ≠ 'Tidak'); null bila bagian ini dimatikan di admin.
   *  Hanya field tampilan; ID dan nilai urutan tidak dikirim. */
  function keinginanPublik(data) {
    if (data && data.set && data.set.publik_keinginan === 'off') return null;
    var semua = ((data && data.keinginan) || []).filter(function (x) { return x.publik !== 'Tidak'; }), aktif = {}, total = 0;
    ['Tinggi', 'Sedang', 'Rendah'].forEach(function (p) {
      aktif[p] = semua.filter(function (x) { return x.status !== 'Selesai' && x.prioritas === p; })
        .sort(function (a, b) { return (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || (a.id > b.id ? 1 : -1); })
        .map(function (x) { total += Number(x.dana) || 0; return { nama: x.nama, dana: Number(x.dana) || 0, waktu: x.waktu || '' }; });
    });
    var selesai = semua.filter(function (x) { return x.status === 'Selesai'; });
    return {
      aktif: aktif, total: total, jmlSelesai: selesai.length,
      selesai: selesai.sort(function (a, b) { return a.selesai < b.selesai ? 1 : a.selesai > b.selesai ? -1 : 0; }).slice(0, 5)
        .map(function (x) { return { nama: x.nama, dana: Number(x.dana) || 0, selesai: x.selesai || '' }; })
    };
  }

  return {
    keinginanPublik: keinginanPublik, katTerbesar: katTerbesar,
    pad: pad, num: num, tglValid: tglValid, bulanValid: bulanValid, bk: bk, geserBulan: geserBulan,
    tambahBulan: tambahBulan, tambahHari: tambahHari, selisihHari: selisihHari, hariAkhir: hariAkhir, idWaktu: idWaktu,
    jadwalPinjaman: jadwalPinjaman, semuaPinjaman: semuaPinjaman, saldoKas: saldoKas, totalBulan: totalBulan,
    berulangAktif: berulangAktif, berulangBulan: berulangBulan, tglBerulang: tglBerulang, proyeksi: proyeksi,
    FREK: FREK, IDUL_FITRI: IDUL_FITRI, tanggalIdulFitri: tanggalIdulFitri, frekBerulang: frekBerulang,
    berulangHidup: berulangHidup, berulangBerikut: berulangBerikut,
    pengingat: pengingat, gabung: gabung, terbaru: terbaru, laporan: laporan, kunciPeriode: kunciPeriode,
    kalender: kalender, publik: publik, mingguKe: mingguKe
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Hitung;
