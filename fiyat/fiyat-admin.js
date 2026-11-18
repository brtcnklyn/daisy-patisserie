// ══════════════════════════════
// FİYAT LİSTESİ (admin paneli)
// Kayıtlı liste: fiyat/fiyat-listesi.json — ürün, fiyat, birim, notlar.
// Firma bilgisi, iskonto ve "listede göster" seçimleri her teklif için geçicidir, kaydedilmez.
// PDF: yeni sekmede A4 sayfalar kurulur, tarayıcının "PDF olarak kaydet" özelliğiyle alınır.
// ══════════════════════════════
const FL_FILE = 'fiyat/fiyat-listesi.json';
const FL_BOLUM = { tatli: 'Tatlılar', sandvic: 'Sandviç & Tost' };
const FL = { veri: null, urunler: [], kirli: false, yuklendi: false };

function flPara(n) {
  const v = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  return '₺' + v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function flSayi(s) {
  s = String(s == null ? '' : s).trim().replace(/[₺\s]/g, '');
  if (!s) return 0;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function flSayiYaz(n) { return Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }); }
function flBugun() { const d = new Date(); return d.toISOString().slice(0, 10); }
function flTarihTR(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}`; }
function flKisa(desc, n = 60) {
  let first = String(desc || '').replace(/\.\.\./g, '…').split(/(?<=[.!?…])\s/)[0].trim();
  if (first.length > n) first = first.slice(0, n).replace(/\s+\S*$/, '').replace(/[,;:]$/, '') + '…';
  return first;
}
function flDurum(msg, hata) {
  const el = document.getElementById('flDurum');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('error', !!hata);
}
function flKirli(v = true) {
  FL.kirli = v;
  const el = document.getElementById('flKirli');
  if (el) el.style.display = v ? 'inline-flex' : 'none';
}
window.addEventListener('beforeunload', e => { if (FL.kirli) { e.preventDefault(); e.returnValue = ''; } });

// ── YÜKLE ──
async function flYukle(zorla) {
  if (FL.yuklendi && !zorla) { flCiz(); return; }
  flDurum('⏳ Fiyat listesi yükleniyor...');
  try {
    const token = getToken();
    let res = null;
    if (token) {
      res = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${FL_FILE}?ref=${GH_BRANCH}&_=${Date.now()}`, {
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github.raw+json' }, cache: 'no-store'
      }).catch(() => null);
    }
    if (!res || !res.ok) res = await fetch(FL_FILE + '?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    FL.veri = await res.json();
    FL.urunler = (FL.veri.urunler || []).map(u => Object.assign({}, u, { dahil: true, sec: false, isk: 0 }));
    FL.yuklendi = true;
    flKirli(false);
    document.getElementById('flNotlar').value = (FL.veri.notlar || []).join('\n');
    if (!document.getElementById('flTarih').value) document.getElementById('flTarih').value = flBugun();
    flSiteSecenekleri();
    flCiz();
    flDurum('');
  } catch (e) {
    flDurum('⚠️ Fiyat listesi okunamadı: ' + e.message, true);
  }
}

// ── LİSTEYİ ÇİZ ──
function flGruplar() {
  // bölüm → grup sırası (ilk görünüşe göre)
  const out = [];
  for (const b of ['tatli', 'sandvic']) {
    const gruplar = [];
    FL.urunler.forEach((u, i) => {
      if (u.bolum !== b) return;
      let g = gruplar.find(x => x.ad === u.grup);
      if (!g) { g = { ad: u.grup, idx: [] }; gruplar.push(g); }
      g.idx.push(i);
    });
    if (gruplar.length) out.push({ bolum: b, gruplar });
  }
  return out;
}

function flCiz() {
  const kok = document.getElementById('flListe');
  if (!kok) return;
  const ara = (document.getElementById('flAra').value || '').toLocaleLowerCase('tr');
  let html = '';
  for (const b of flGruplar()) {
    html += `<div class="fl-bolum">${FL_BOLUM[b.bolum]}</div>`;
    for (const g of b.gruplar) {
      const satirlar = g.idx.filter(i => !ara || (FL.urunler[i].ad + ' ' + FL.urunler[i].grup).toLocaleLowerCase('tr').includes(ara));
      if (!satirlar.length) continue;
      html += `<div class="fl-grup"><span>${escapeHtml(g.ad)}</span><button class="fl-mini" onclick="flGrupSec('${b.bolum}', ${JSON.stringify(g.ad).replace(/"/g, '&quot;')})">grubu seç</button></div>`;
      for (const i of satirlar) html += flSatirHtml(FL.urunler[i], i);
    }
  }
  kok.innerHTML = html || '<div class="davet-empty">Listede ürün yok.</div>';
  flOzet();
}

function flSatirHtml(u, i) {
  const img = u.gorsel ? `<img src="${escapeHtml(u.gorsel)}" alt="">` : '<div class="fl-ph">✿</div>';
  const birim = u.bolum === 'sandvic'
    ? `<label class="fl-k">Gramaj<input class="fl-in w-s" value="${escapeHtml(u.gramaj || '')}" onchange="flAlan(${i},'gramaj',this.value)"></label>
       <label class="fl-k">Koli içi<input class="fl-in w-xs" inputmode="numeric" value="${escapeHtml(u.koli || '')}" onchange="flAlan(${i},'koli',parseInt(this.value)||0)"></label>`
    : `<label class="fl-k">Birim<input class="fl-in w-m" value="${escapeHtml(u.birim || '')}" onchange="flAlan(${i},'birim',this.value)"></label>
       <label class="fl-k">Saklama<select class="fl-in w-s" onchange="flAlan(${i},'saklama',this.value)"><option${u.saklama === 'Taze' ? ' selected' : ''}>Taze</option><option${u.saklama === 'Donuk' ? ' selected' : ''}>Donuk</option></select></label>`;
  const net = u.isk > 0 ? `<span class="fl-net">→ ${flPara(u.fiyat - Math.round(u.fiyat * u.isk) / 100)}</span>` : '';
  return `<div class="fl-satir${u.dahil ? '' : ' kapali'}${u.sec ? ' secili' : ''}">
    <input type="checkbox" class="fl-cb" ${u.sec ? 'checked' : ''} onchange="flSec(${i}, this.checked)" title="İskonto için seç">
    ${img}
    <div class="fl-ad">
      <input class="fl-in nm" value="${escapeHtml(u.ad)}" onchange="flAlan(${i},'ad',this.value)">
      <input class="fl-in ac" value="${escapeHtml(u.aciklama || '')}" placeholder="Kısa açıklama" onchange="flAlan(${i},'aciklama',this.value)">
    </div>
    <div class="fl-alanlar">
      ${birim}
      <label class="fl-k">Fiyat ₺<input class="fl-in w-s fiyat" inputmode="decimal" value="${flSayiYaz(u.fiyat)}" onchange="flAlan(${i},'fiyat',flSayi(this.value))"></label>
      <label class="fl-k">İskonto %<input class="fl-in w-xs" inputmode="decimal" value="${u.isk ? flSayiYaz(u.isk) : ''}" placeholder="—" onchange="flIsk(${i}, this.value)"></label>
      ${net}
    </div>
    <div class="fl-islem">
      <button class="fl-mini ${u.dahil ? '' : 'off'}" onclick="flDahil(${i})" title="Bu teklifte göster/gizle">${u.dahil ? '👁 Listede' : '🚫 Gizli'}</button>
      <button class="fl-mini" onclick="flTasi(${i},-1)" title="Yukarı">↑</button>
      <button class="fl-mini" onclick="flTasi(${i},1)" title="Aşağı">↓</button>
      <button class="fl-mini sil" onclick="flSil(${i})" title="Listeden sil">✕</button>
    </div>
  </div>`;
}

function flOzet() {
  const sec = FL.urunler.filter(u => u.sec).length;
  const dahil = FL.urunler.filter(u => u.dahil).length;
  const isk = FL.urunler.filter(u => u.dahil && u.isk > 0).length;
  const el = document.getElementById('flOzet');
  if (el) el.textContent = `${dahil} / ${FL.urunler.length} ürün listede · ${sec} seçili · ${isk} üründe iskonto`;
  const b = document.getElementById('flSecBtn');
  if (b) b.textContent = `Seçili ${sec} ürüne uygula`;
}

// ── SATIR İŞLEMLERİ ──
function flAlan(i, k, v) { FL.urunler[i][k] = v; flKirli(); if (k === 'fiyat') flCiz(); }
function flSec(i, v) { FL.urunler[i].sec = v; flCiz(); }
function flDahil(i) { FL.urunler[i].dahil = !FL.urunler[i].dahil; flCiz(); }
function flIsk(i, v) { FL.urunler[i].isk = Math.max(0, Math.min(100, flSayi(v))); flCiz(); }
function flGrupSec(b, g) {
  const hepsi = FL.urunler.filter(u => u.bolum === b && u.grup === g);
  const durum = !hepsi.every(u => u.sec);
  hepsi.forEach(u => u.sec = durum);
  flCiz();
}
function flTumunuSec(v) { FL.urunler.forEach(u => u.sec = v); flCiz(); }
function flTasi(i, yon) {
  const u = FL.urunler[i];
  let j = i + yon;
  while (j >= 0 && j < FL.urunler.length && !(FL.urunler[j].bolum === u.bolum && FL.urunler[j].grup === u.grup)) j += yon;
  if (j < 0 || j >= FL.urunler.length) return;
  [FL.urunler[i], FL.urunler[j]] = [FL.urunler[j], FL.urunler[i]];
  flKirli(); flCiz();
}
function flSil(i) {
  if (!confirm('"' + FL.urunler[i].ad + '" fiyat listesinden silinsin mi? (Kaydet\'e basınca kalıcı olur)')) return;
  FL.urunler.splice(i, 1); flKirli(); flCiz();
}

// ── İSKONTO ──
function flIskUygula(kime) {
  const oran = Math.max(0, Math.min(100, flSayi(document.getElementById('flIskOran').value)));
  if (!oran) { flDurum('⚠️ Önce iskonto oranını yazın (ör. 10).', true); return; }
  const hedef = kime === 'tum' ? FL.urunler.filter(u => u.dahil) : FL.urunler.filter(u => u.sec);
  if (!hedef.length) { flDurum('⚠️ İskonto uygulanacak ürün seçilmedi. Ürünlerin solundaki kutucukları işaretleyin.', true); return; }
  hedef.forEach(u => u.isk = oran);
  flDurum(`✅ ${hedef.length} ürüne %${flSayiYaz(oran)} iskonto uygulandı.`);
  flCiz();
}
function flIskTemizle() { FL.urunler.forEach(u => u.isk = 0); flDurum('İskontolar kaldırıldı.'); flCiz(); }

// ── ÜRÜN EKLE ──
function flSiteSecenekleri() {
  const sel = document.getElementById('flSite');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Sitedeki üründen doldur (isteğe bağlı) —</option>' +
    products.map((p, i) => `<option value="${i}">${escapeHtml(p.name)} · ${escapeHtml(p.tag)}</option>`).join('');
  const dl = document.getElementById('flGrupList');
  if (dl) dl.innerHTML = [...new Set(FL.urunler.map(u => u.grup))].map(g => `<option value="${escapeHtml(g)}">`).join('');
}
const FL_SANDVIC_TAG = ['Panini', 'Aperto', 'Bagel', 'Bunwich', 'Gurme Sandviç', 'Tost', 'Unlu Mamul'];
function flSiteDoldur() {
  const v = document.getElementById('flSite').value;
  if (v === '') return;
  const p = products[+v];
  const sandvic = FL_SANDVIC_TAG.includes(p.tag);
  document.getElementById('flYBolum').value = sandvic ? 'sandvic' : 'tatli';
  flYeniBolum();
  document.getElementById('flYAd').value = p.name;
  document.getElementById('flYAc').value = flKisa(p.desc);
  document.getElementById('flYSak').value = p.frozen ? 'Donuk' : 'Taze';
  const gr = (p.desc.match(/^(\d+\s*gr)\./) || [])[1];
  if (gr) document.getElementById('flYGr').value = gr;
  const koli = (p.desc.match(/kutuda (\d+) adet/) || [])[1];
  if (koli) document.getElementById('flYKoli').value = koli;
  if (p.isWhole) document.getElementById('flYBirim').value = '1 bütün · 10 dilim';
  FL._yeniGorsel = p.img;
  document.getElementById('flYImgOn').innerHTML = `<img src="${escapeHtml(p.img)}" alt="">`;
}
function flYeniBolum() {
  const s = document.getElementById('flYBolum').value === 'sandvic';
  document.querySelectorAll('.fl-y-tatli').forEach(e => e.style.display = s ? 'none' : '');
  document.querySelectorAll('.fl-y-sandvic').forEach(e => e.style.display = s ? '' : 'none');
}
function flYeniGorsel(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = ev => {
    const im = new Image();
    im.onload = () => {
      const max = 600, k = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      FL._yeniGorsel = c.toDataURL('image/jpeg', 0.85);
      document.getElementById('flYImgOn').innerHTML = `<img src="${FL._yeniGorsel}" alt="">`;
    };
    im.src = ev.target.result;
  };
  r.readAsDataURL(f);
}
function flUrunEkle() {
  const g = id => document.getElementById(id).value.trim();
  const bolum = g('flYBolum'), ad = g('flYAd'), fiyat = flSayi(g('flYFiyat'));
  if (!ad) { flDurum('⚠️ Ürün adı yazın.', true); return; }
  if (!fiyat) { flDurum('⚠️ Fiyat yazın.', true); return; }
  const grup = g('flYGrup') || (bolum === 'sandvic' ? 'Sandviçler' : 'Tatlılar');
  const u = { bolum, grup, ad, gorsel: FL._yeniGorsel || '', aciklama: g('flYAc'), fiyat, dahil: true, sec: false, isk: 0 };
  if (bolum === 'sandvic') { u.gramaj = g('flYGr'); u.koli = parseInt(g('flYKoli')) || 0; if (!u.aciklama) u.aciklama = grup; }
  else { u.saklama = g('flYSak'); u.birim = g('flYBirim') || 'adet'; }
  // aynı grubun son ürününden sonra ekle
  let pos = -1;
  FL.urunler.forEach((x, i) => { if (x.bolum === bolum && x.grup === grup) pos = i; });
  if (pos < 0) FL.urunler.forEach((x, i) => { if (x.bolum === bolum) pos = i; });
  FL.urunler.splice(pos + 1, 0, u);
  ['flYAd', 'flYAc', 'flYFiyat', 'flYGr', 'flYKoli'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('flSite').value = '';
  document.getElementById('flYImg').value = '';
  document.getElementById('flYImgOn').innerHTML = '';
  FL._yeniGorsel = '';
  flKirli(); flSiteSecenekleri(); flCiz();
  flDurum(`✅ "${ad}" listeye eklendi. Kalıcı olması için "💾 Listeyi Kaydet"e basın.`);
}

// ── KAYDET (GitHub) ──
async function flGhSha(path, headers) {
  const r = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}?ref=${GH_BRANCH}&_=${Date.now()}`, { headers, cache: 'no-store' });
  if (r.status === 404) return null;
  if (r.status === 401) throw new Error('GitHub anahtarı geçersiz. Ayarlar sekmesinden yeni anahtar girin.');
  if (!r.ok) throw new Error('GitHub bağlantı hatası (' + r.status + ')');
  return (await r.json()).sha;
}
async function flGhPut(path, b64, mesaj, headers) {
  const body = { message: mesaj, content: b64, branch: GH_BRANCH };
  const sha = await flGhSha(path, headers);
  if (sha) body.sha = sha;
  const r = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, { method: 'PUT', headers, body: JSON.stringify(body) });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error('Yükleme hatası (HTTP ' + r.status + '): ' + (e.message || '')); }
}
async function flBlobB64(url) {
  const b = await (await fetch(url)).blob();
  return await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = no; r.readAsDataURL(b); });
}
async function flKaydet() {
  const token = getToken();
  if (!token) { flDurum('⚠️ Kaydetmek için Ayarlar sekmesinde GitHub erişim anahtarı olmalı.', true); return; }
  const headers = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  try {
    // Görseller: yeni yüklenen (data:) veya sitedeki ürün görseli (img/...) → fiyat/img/ altına kopya
    let n = 0;
    for (const u of FL.urunler) {
      if (!u.gorsel || u.gorsel.startsWith('fiyat/img/')) continue;
      n++; flDurum(`⏳ Görsel kaydediliyor (${n})...`);
      let b64, ad;
      if (u.gorsel.startsWith('data:')) { b64 = u.gorsel.split(',')[1]; ad = 'y-' + (await sha256(b64)).slice(0, 10) + '.jpg'; }
      else { b64 = await flBlobB64(u.gorsel); ad = u.gorsel.split('/').pop().split('?')[0]; }
      const yol = 'fiyat/img/' + ad;
      if (!(await flGhSha(yol, headers))) await flGhPut(yol, b64, 'Fiyat listesi görseli (admin paneli)', headers);
      u.gorsel = yol;
    }
    flDurum('⏳ Fiyat listesi kaydediliyor...');
    const temiz = FL.urunler.map(u => { const c = Object.assign({}, u); delete c.dahil; delete c.sec; delete c.isk; return c; });
    const veri = Object.assign({}, FL.veri, {
      guncelleme: flBugun(),
      notlar: document.getElementById('flNotlar').value.split('\n').map(s => s.trim()).filter(Boolean),
      urunler: temiz
    });
    await flGhPut(FL_FILE, toB64(JSON.stringify(veri, null, 1)), 'Fiyat listesi güncellendi (admin paneli)', headers);
    FL.veri = veri;
    flKirli(false); flCiz();
    flDurum('✅ Fiyat listesi kaydedildi. Bir sonraki açılışta bu haliyle gelir.');
  } catch (e) {
    flDurum('⚠️ ' + e.message, true);
  }
}
function flGeriAl() {
  if (FL.kirli && !confirm('Kaydedilmemiş değişiklikler silinip kayıtlı liste yüklensin mi?')) return;
  flYukle(true);
}

// ── PDF ──
function flPdf() {
  const firma = document.getElementById('flFirma').value.trim();
  const yetkili = document.getElementById('flYetkili').value.trim();
  const iletisim = document.getElementById('flIletisim').value.trim();
  const tarih = flTarihTR(document.getElementById('flTarih').value);
  const gecer = flTarihTR(document.getElementById('flGecer').value);
  const baslik = (document.getElementById('flBaslik').value.trim() || 'FİYAT LİSTESİ').toLocaleUpperCase('tr');
  const bolumler = [];
  for (const b of flGruplar()) {
    const gruplar = b.gruplar.map(g => ({
      ad: g.ad,
      satirlar: g.idx.map(i => FL.urunler[i]).filter(u => u.dahil).map(u => ({
        ad: u.ad, aciklama: u.aciklama || '', gorsel: u.gorsel || '', saklama: u.saklama || '', birim: u.birim || '',
        gramaj: u.gramaj || '', koli: u.koli || 0, fiyat: Number(u.fiyat) || 0, isk: Number(u.isk) || 0
      }))
    })).filter(g => g.satirlar.length);
    if (gruplar.length) bolumler.push({ tur: b.bolum, ad: FL_BOLUM[b.bolum], gruplar });
  }
  if (!bolumler.length) { flDurum('⚠️ Listede gösterilecek ürün yok.', true); return; }
  const alt = bolumler.map(b => b.tur === 'tatli' ? 'TATLI' : 'SANDVİÇ · TOST').join(' · ');
  const iskVar = bolumler.some(b => b.gruplar.some(g => g.satirlar.some(s => s.isk > 0)));
  const notlar = document.getElementById('flNotlar').value.split('\n').map(s => s.trim()).filter(Boolean)
    .filter(n => bolumler.some(b => b.tur === 'sandvic') || !/sandviç/i.test(n))
    .filter(n => bolumler.some(b => b.tur === 'tatli') || !/kup tatlı/i.test(n));
  if (iskVar) notlar.unshift('İskonto sütununda belirtilen ürünlere iskonto uygulanmıştır.');
  const dosya = 'Daisy ' + (baslik === 'FİYAT LİSTESİ' ? 'Fiyat Listesi' : baslik.charAt(0) + baslik.slice(1).toLocaleLowerCase('tr'))
    + (firma ? ' - ' + firma : '') + (tarih ? ' - ' + tarih : '');
  const veri = { baslik, alt, tarih, gecer, firma, yetkili, iletisim, bolumler, notlar };
  const tabanUrl = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  const json = JSON.stringify(veri).replace(/</g, '\\u003c');
  const html = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(dosya)}</title><base href="${tabanUrl}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="fiyat/sablon.css?v=1">
<style>
  .arac { position: sticky; top: 0; z-index: 9; background: #3d4a33; color: #fff; padding: 10px 14px; display: flex; gap: 12px; align-items: center; justify-content: center; flex-wrap: wrap; font: 14px 'DM Sans', sans-serif; }
  .arac button { background: #E8D07A; color: #3d4a33; border: 0; border-radius: 20px; padding: 9px 18px; font: 600 14px 'DM Sans', sans-serif; cursor: pointer; }
  .arac small { opacity: .8; }
  #kok { padding-top: 14px; }
  .govde { display: block; }
  .party .val { border-bottom: 0; }
  table.pl td.num.list { color: var(--mute); font-weight: 500; font-size: 8.8pt; }
  table.pl td.num.disc { color: #a0533f; font-weight: 600; font-size: 8.6pt; }
  @media print { .arac { display: none; } #kok { padding: 0; } }
  @media screen and (max-width: 820px) { #kok { zoom: 0.46; } }
</style></head><body>
<div class="arac"><button onclick="print()">🖨️ PDF olarak kaydet / Yazdır</button><small>Açılan pencerede hedef olarak “PDF olarak kaydet”i seçin.</small></div>
<div id="kok"></div>
<script>(${flSayfala.toString()})(${json});<\/script>
</body></html>`;
  const w = window.open('', '_blank');
  if (!w) { flDurum('⚠️ Tarayıcı yeni sekmeyi engelledi. Açılır pencerelere izin verip tekrar deneyin.', true); return; }
  w.document.open(); w.document.write(html); w.document.close();
  flDurum('✅ PDF sekmesi açıldı. Yazdır penceresinde “PDF olarak kaydet”i seçin.');
}

// Bu fonksiyon PDF sekmesinin içinde çalışır (toString ile aktarılır) — dışarıdaki değişkenlere erişmez.
function flSayfala(V) {
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const yuv = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const tl = n => '₺' + yuv(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const yz = n => Number(n).toLocaleString('tr-TR', { maximumFractionDigits: 2 });
  const net = s => yuv(s.fiyat - yuv(s.fiyat * s.isk / 100));
  const PH = '<div class="ph"><svg viewBox="0 0 100 100" width="10mm" height="10mm"><g fill="none" stroke="currentColor" stroke-width="4">'
    + [0, 40, 80, 120, 160, 200, 240, 280, 320].map(a => `<ellipse cx="50" cy="22" rx="9" ry="20" transform="rotate(${a} 50 50)"/>`).join('')
    + '</g><circle cx="50" cy="50" r="10" fill="currentColor"/></svg></div>';
  const gorsel = s => s.gorsel ? `<img src="${esc(s.gorsel)}" alt=""${s.tur === 'sandvic' ? ' class="c"' : ''}>` : PH;

  const BAND = `<header class="band">
    <div class="brand"><img src="fiyat/logo-beyaz.png" alt="Daisy Patisserie"><div class="contact">0531 857 52 58 &nbsp;|&nbsp; @daisypatisserie_</div></div>
    <div class="title-wrap">
      <svg class="brush" viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true"><defs>
        <filter id="rough" x="-10%" y="-20%" width="120%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.035 0.9" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="16" xChannelSelector="R" yChannelSelector="G"/></filter>
        <filter id="rough2" x="-10%" y="-20%" width="120%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.05 0.7" numOctaves="2" seed="3" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="22" xChannelSelector="R" yChannelSelector="G"/></filter></defs>
        <g filter="url(#rough2)" opacity="0.55"><path d="M14 10 C 120 2, 260 4, 388 12 L 384 52 C 250 46, 130 52, 20 58 Z" fill="#5b6b4e"/><path d="M26 102 C 150 94, 280 98, 376 106 L 372 142 C 260 138, 140 142, 32 146 Z" fill="#5b6b4e"/></g>
        <g filter="url(#rough)"><path d="M8 22 C 130 10, 270 14, 394 20 L 390 130 C 260 124, 140 130, 12 136 Z" fill="#4f5f42"/></g></svg>
      <div class="title-text"><h1>${esc(V.baslik)}</h1><div class="sub">${esc(V.alt)}</div>
        <div class="meta">${V.tarih ? `<div><span class="k">TARİH :</span><span>${esc(V.tarih)}</span></div>` : ''}${V.gecer ? `<div><span class="k">GEÇERLİLİK :</span><span>${esc(V.gecer)}</span></div>` : ''}</div></div>
    </div></header>`;
  const PARTI = (V.firma || V.yetkili || V.iletisim) ? `<section class="parties">
    <div class="party"><div class="lbl">Müşteri</div><div class="val">${esc(V.firma) || '&nbsp;'}</div></div>
    <div class="party"><div class="lbl">Yetkili</div><div class="val">${esc(V.yetkili) || '&nbsp;'}</div>${V.iletisim ? `<div class="val small">${esc(V.iletisim)}</div>` : ''}</div>
  </section><div class="rule"></div>` : '';
  const MINI = b => `<header class="mini-band"><img src="fiyat/logo-beyaz.png" alt="Daisy Patisserie"><div class="r">${esc(V.baslik)}<br><span>${esc(b ? b.ad.toLocaleUpperCase('tr') : '')}</span></div></header>`;
  const FOOT = `<footer class="foot"><span>Kayabaşı Mah. Albayrak Sok. No:2K, İnci Sitesi 15. Bölge, Kayaşehir – Başakşehir / İstanbul</span>
    <span><b>daisy.patisseriee@gmail.com</b> &nbsp;·&nbsp; <b>daisypatisserie.com</b></span><span class="pageno"></span></footer>`;

  function kolon(b, isk) {
    if (b.tur === 'tatli') return isk
      ? { col: [21, 0, 14, 25, 20, 15, 23], th: ['Görsel', 'Ürün', 'Saklama', 'Birim', 'Liste fiyatı', 'İskonto', 'İskontolu fiyat'] }
      : { col: [21, 0, 16, 30, 26], th: ['Görsel', 'Ürün', 'Saklama', 'Birim', 'Fiyat'] };
    return isk
      ? { col: [20, 0, 14, 15, 19, 14, 21, 23], th: ['Görsel', 'Ürün', 'Gramaj', 'Koli içi', 'Adet liste fiyatı', 'İskonto', 'İskontolu adet', 'İskontolu koli'] }
      : { col: [21, 0, 16, 17, 23, 25], th: ['Görsel', 'Ürün', 'Gramaj', 'Koli içi', 'Adet fiyatı', 'Koli fiyatı'] };
  }
  function satir(b, s, isk) {
    s.tur = b.tur;
    const ad = `<td class="img">${gorsel(s)}</td><td class="desc"><div class="nm">${esc(s.ad)}</div>${s.aciklama ? `<div class="fl">${esc(s.aciklama)}</div>` : ''}</td>`;
    const iskH = s.isk > 0 ? `%${yz(s.isk)}` : '—';
    if (b.tur === 'tatli') return `<tr>${ad}<td class="unit">${esc(s.saklama || '—')}</td><td class="unit">${esc(s.birim)}</td>`
      + (isk ? `<td class="num list">${tl(s.fiyat)}</td><td class="num disc">${iskH}</td><td class="num net">${tl(net(s))}</td>` : `<td class="num net">${tl(s.fiyat)}</td>`) + '</tr>';
    const k = s.koli || 0;
    return `<tr>${ad}<td class="unit">${esc(s.gramaj || '—')}</td><td class="unit">${k ? k + ' adet' : '—'}</td>`
      + (isk ? `<td class="num list">${tl(s.fiyat)}</td><td class="num disc">${iskH}</td><td class="num net">${tl(net(s))}</td><td class="num koli">${k ? tl(yuv(net(s) * k)) : '—'}</td>`
             : `<td class="num net">${tl(s.fiyat)}</td><td class="num koli">${k ? tl(yuv(s.fiyat * k)) : '—'}</td>`) + '</tr>';
  }

  const kok = document.getElementById('kok');
  const sayfalar = [];
  function yeniSayfa(b) {
    const pg = document.createElement('div');
    pg.className = 'page';
    pg.innerHTML = (sayfalar.length ? MINI(b) : BAND + PARTI) + '<div class="govde"></div>' + FOOT;
    kok.appendChild(pg); sayfalar.push(pg);
    return pg;
  }
  const tasti = pg => pg.scrollHeight > pg.clientHeight + 1;
  function tablo(pg, b, k, baslikli) {
    const g = pg.querySelector('.govde');
    if (baslikli) g.insertAdjacentHTML('beforeend', `<div class="sec-h"><h2>${esc(b.ad)}</h2>${b.tur === 'sandvic' ? '<span>Donuk · koli halinde</span>' : ''}</div>`);
    const sec = document.createElement('section');
    sec.className = baslikli ? 'items after-h' : 'items';
    if (!baslikli) sec.style.paddingTop = '6mm';
    sec.innerHTML = `<table class="pl"><colgroup>${k.col.map(w => w ? `<col style="width:${w}mm">` : '<col>').join('')}</colgroup><thead><tr>${k.th.map((t, i) => `<th${i === 1 ? ' class="l"' : ''}>${t}</th>`).join('')}</tr></thead><tbody></tbody></table>`;
    g.appendChild(sec);
    return sec.querySelector('tbody');
  }

  function kur() {
    let pg = null;
    V.bolumler.forEach(b => {
      const isk = b.gruplar.some(g => g.satirlar.some(s => s.isk > 0));
      const k = kolon(b, isk);
      pg = yeniSayfa(b);
      let tb = tablo(pg, b, k, true);
      b.gruplar.forEach(g => {
        const kat = `<tr class="cat"><td colspan="${k.th.length}">${esc(g.ad)}</td></tr>`;
        g.satirlar.forEach((s, si) => {
          if (si === 0) tb.insertAdjacentHTML('beforeend', kat);
          tb.insertAdjacentHTML('beforeend', satir(b, s, isk));
          if (tasti(pg)) {
            tb.lastElementChild.remove();
            const yetim = tb.lastElementChild && tb.lastElementChild.classList.contains('cat');
            if (yetim) tb.lastElementChild.remove();
            pg = yeniSayfa(b);
            tb = tablo(pg, b, k, false);
            if (yetim) tb.insertAdjacentHTML('beforeend', kat);
            tb.insertAdjacentHTML('beforeend', satir(b, s, isk));
          }
        });
      });
    });
    if (V.notlar.length) {
      const not = `<section class="notes3"><div class="lbl">Notlar</div><ul>${V.notlar.map(n => `<li>${esc(n)}</li>`).join('')}</ul></section>
        <div class="cta">Sipariş için WhatsApp: <b>0531 857 52 58</b> &nbsp;·&nbsp; www.daisypatisserie.com</div>`;
      pg.querySelector('.govde').insertAdjacentHTML('beforeend', `<div class="kuyruk">${not}</div>`);
      if (tasti(pg)) {
        pg.querySelector('.kuyruk').remove();
        pg = yeniSayfa(V.bolumler[V.bolumler.length - 1]);
        pg.querySelector('.govde').insertAdjacentHTML('beforeend', `<div class="kuyruk" style="padding-top:2mm">${not}</div>`);
      }
    }
    sayfalar.forEach((p, i) => p.querySelector('.pageno').textContent = `Sayfa ${i + 1} / ${sayfalar.length}`);
  }

  const resimler = () => Promise.all([...document.images].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
  const yuklendi = new Promise(r => document.readyState === 'complete' ? r() : window.addEventListener('load', r));
  const yaziTipi = () => document.fonts ? document.fonts.ready : Promise.resolve();
  Promise.race([yuklendi.then(yaziTipi), new Promise(r => setTimeout(r, 8000))]).then(() => {
    kur();
    return Promise.race([resimler(), new Promise(r => setTimeout(r, 6000))]);
  }).then(() => setTimeout(() => window.print(), 400));
}
