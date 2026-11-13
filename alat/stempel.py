#!/usr/bin/env python3
"""Stempel versi aset (cache-busting) dan daftar ikon Material Symbols.
Jalankan setiap kali isi css/ atau js/ berubah:  python3 alat/stempel.py
1) ?v=<hash> pada setiap css/js di index.html & admin.html
2) icon_names= berisi semua ikon yang dipakai (subset font, ±10 KB alih-alih ±300 KB)
3) daftar aset & nama cache di sw.js (pengunjung otomatis mendapat versi baru)"""
import hashlib, json, os, re, sys
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'frontend')
def baca(p): return open(os.path.join(ROOT, p), encoding='utf-8').read()
def tulis(p, s): open(os.path.join(ROOT, p), 'w', encoding='utf-8').write(s)
def h(p): return hashlib.sha256(open(os.path.join(ROOT, p), 'rb').read()).hexdigest()[:8]

# --- kumpulkan nama ikon (hanya pola yang pasti ikon; nama salah membuat Google menolak subset) ---
ikon = set()
teks = ''.join(baca(p) for p in ['js/admin.js', 'js/publik.js', 'js/inti.js', 'index.html', 'admin.html'])
pola = [r"\bic\(\s*'([a-z][a-z0-9_]+)'",                                   # ic('nama')
        r"\bic\([^()]*?\?\s*'([a-z][a-z0-9_]+)'\s*:\s*'([a-z][a-z0-9_]+)'",  # ic(x ? 'a' : 'b')
        r"btn\(\s*'[^']*'\s*,\s*(?:'[^']*'|[^,]+)\s*,\s*'([a-z][a-z0-9_]+)'",   # btn(aksi, label, 'ikon')
        r"kosong\(\s*'([a-z][a-z0-9_]+)'",
        r"metric\((?:[^()]|\([^()]*\))*?,\s*'([a-z][a-z0-9_]+)'\s*(?:,|\))",
        r"\[\s*'[a-z]+'\s*,\s*'[^']+'\s*,\s*'([a-z][a-z0-9_]+)'\s*\]",       # MENU
        r'<span class="ic[^"]*"[^>]*>([a-z][a-z0-9_]+)</span>']
for pp in pola:
    for m in re.finditer(pp, teks):
        ikon.update(g for g in m.groups() if g)
m = re.search(r"IKON_PILIHAN = \[([^\]]*)\]", teks)
ikon.update(re.findall(r"'([a-z][a-z0-9_]+)'", m.group(1)))
kode = open(os.path.join(ROOT, '..', 'backend', 'Kode.gs'), encoding='utf-8').read() + open(os.path.join(ROOT, '..', 'backend', 'Migrasi.gs'), encoding='utf-8').read()
ikon.update(re.findall(r"'(?:Pemasukan|Pengeluaran)', '[^']+', '([a-z_]+)'", kode))
ikon.update(re.findall(r"/, '([a-z_]+)'\]", kode))
# ikon yang dipakai lewat variabel (toast, ikonJenis, katMeta, ternary di metric)
ikon.update(['sell', 'south_west', 'north_east', 'account_balance', 'error', 'warning', 'check_circle', 'trending_down', 'trending_up',
             'expand_less', 'expand_more', 'shopping_bag', 'savings', 'visibility_off', 'visibility', 'pie_chart', 'task_alt',
             'event_available', 'cloud_off', 'settings', 'refresh', 'download', 'check', 'verified', 'receipt_long', 'event_repeat'])
ikon = sorted(ikon)
# --- stempel ---
for html in ['index.html', 'admin.html']:
    s = baca(html)
    s = re.sub(r'((?:href|src)="((?:css|js)/[^"?]+))(\?v=[^"]*)?"', lambda m: m.group(1) + '?v=' + h(m.group(2)) + '"', s)
    s = re.sub(r'icon_names=[^&"]*', 'icon_names=' + ','.join(ikon), s)
    tulis(html, s)
aset = ['./', './index.html', './admin.html', './manifest.json', './manifest-admin.json',
        './assets/logo.svg', './assets/icon-192.png', './assets/apple-touch-icon.png']
for html in ['index.html', 'admin.html']:
    for m in re.finditer(r'(?:href|src)="((?:css|js)/[^"]+)"', baca(html)):
        if './' + m.group(1) not in aset: aset.append('./' + m.group(1))
# gambar & manifest ikut dihitung supaya ganti logo/ikon juga memperbarui cache service worker
gambar = ''.join(f + h(os.path.join('assets', f)) for f in sorted(os.listdir(os.path.join(ROOT, 'assets'))))
gambar += h('manifest.json') + h('manifest-admin.json')
versi = hashlib.sha256(''.join(aset).encode() + baca('index.html').encode() + baca('admin.html').encode() + gambar.encode()).hexdigest()[:10]
sw = baca('sw.js')
sw = re.sub(r"const VERSI = '[^']*';", "const VERSI = 'kb-" + versi + "';", sw)
sw = re.sub(r"const ASET = \[[^\]]*\];", 'const ASET = ' + json.dumps(aset) + ';', sw)
tulis('sw.js', sw)
print(f'{len(ikon)} ikon, {len(aset)} aset, cache kb-{versi}')
