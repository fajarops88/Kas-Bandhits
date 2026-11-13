// Terapkan tema sebelum halaman digambar (mencegah kedip putih di mode gelap). Tanpa skrip inline agar CSP ketat.
try { if (JSON.parse(localStorage.getItem('kb_tema')) === 'gelap') document.documentElement.setAttribute('data-tema', 'gelap'); } catch (e) { }
