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
  function berulangAktif(b, key) {
    if (!(b.aktif === true || b.aktif === 'TRUE' || b.aktif === 1 || b.aktif === '1')) return false;
    if (!bulanValid(b.mulai) || key < b.mulai) return false;
    if (b.selesai && bulanValid(b.selesai) && key > b.selesai) return false;
    return num(b.nom) > 0;
  }
  function tglBerulang(b, key) {
    var y = +key.slice(0, 4), m = +key.slice(5, 7);
    return key + '-' + pad(Math.min(Math.max(1, Math.floor(num(b.hari)) || 1), hariAkhir(y, m)));
  }
  /** Butir berulang yang benar-benar menambah proyeksi di bulan `key` (sudah dikurangi yang cocok). */
  function berulangBulan(data, key) {
    var tercatat = {
      Pemasukan: (data.pemasukan || []).filter(function (x) { return bk(x.tgl) === key; }).slice(),
      Pengeluaran: (data.pengeluaran || []).filter(function (x) { return bk(x.tgl) === key; }).slice()
    };
    var hasil = [];
    (data.berulang || []).forEach(function (b) {
      if (!berulangAktif(b, key)) return;
      var daftar = tercatat[b.jenis] || [];
      var idx = -1;
      for (var i = 0; i < daftar.length; i++) {
        if (sama(daftar[i].kat, b.kat) && Math.round(num(daftar[i].nom)) === Math.round(num(b.nom))) { idx = i; break; }
      }
      if (idx > -1) { daftar.splice(idx, 1); return; }          // sudah tercatat → jangan dihitung dua kali
      hasil.push({ id: b.id, jenis: b.jenis, kat: b.kat, ket: b.ket || '', nom: num(b.nom), tgl: tglBerulang(b, key) });
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
      if (!berulangAktif(b, key)) return;
      var t = tglBerulang(b, key);
      add(t, { tipe: 'berulang', id: b.id, jenis: b.jenis, judul: b.ket || b.kat, kat: b.kat, nominal: num(b.nom), tgl: t });
    });
    return ev;
  }

  /* ---------------- Snapshot halaman publik (allowlist R8) ---------------- */
  function publik(data, hariIni) {
    var kini = bk(hariIni), tb = totalBulan(data, kini, hariIni), pg = pengingat(data, hariIni);
    function bersih(it) { return { pihak: it.pihak, ke: it.ke, dari: it.dari, tgl: it.tgl, nominal: it.nominal, sisa: it.sisa, lunas: it.lunas }; }
    return {
      hariIni: hariIni,
      saldoKas: saldoKas(data, hariIni),
      bulan: { kunci: kini, pemasukan: tb.pemasukan, pengeluaran: tb.pengeluaran, cicilan: tb.cicilan,
        jmlPemasukan: tb.jmlPemasukan, jmlPengeluaran: tb.jmlPengeluaran },
      pengingat: {
        minggu: pg.minggu.map(function (m) { return { ke: m.ke, dari: m.dari, sampai: m.sampai, total: m.total, sisa: m.sisa, items: m.items.map(bersih) }; }),
        tunggakan: pg.tunggakan.map(bersih), totalBulan: pg.totalBulan, sisaBulan: pg.sisaBulan, totalTunggakan: pg.totalTunggakan
      },
      proyeksi: proyeksi(data, hariIni, 5).map(function (r) {
        return { bulan: r.bulan, berjalan: r.berjalan, saldoAwal: r.saldoAwal, pemasukan: r.pemasukan, pengeluaran: r.pengeluaran, cicilan: r.cicilan, saldoAkhir: r.saldoAkhir };
      }),
      terbaru: terbaru(data, hariIni, 5).map(function (x) { return { tgl: x.tgl, jenis: x.jenis, kat: x.kat, ket: x.ket, nom: x.nom }; })
    };
  }

  return {
    pad: pad, num: num, tglValid: tglValid, bulanValid: bulanValid, bk: bk, geserBulan: geserBulan,
    tambahBulan: tambahBulan, tambahHari: tambahHari, selisihHari: selisihHari, hariAkhir: hariAkhir, idWaktu: idWaktu,
    jadwalPinjaman: jadwalPinjaman, semuaPinjaman: semuaPinjaman, saldoKas: saldoKas, totalBulan: totalBulan,
    berulangAktif: berulangAktif, berulangBulan: berulangBulan, tglBerulang: tglBerulang, proyeksi: proyeksi,
    pengingat: pengingat, gabung: gabung, terbaru: terbaru, laporan: laporan, kunciPeriode: kunciPeriode,
    kalender: kalender, publik: publik, mingguKe: mingguKe
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Hitung;
