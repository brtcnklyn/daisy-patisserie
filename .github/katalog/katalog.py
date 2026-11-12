# -*- coding: utf-8 -*-
"""Daisy Patisserie ürün kataloğu (fiyatsız PDF).

Ürünleri index.html içindeki PRODUCT_DATA'dan okur, A4 katalog HTML'i kurar ve
Chrome/Edge headless ile PDF'e basar.

Kullanım:  python .github/katalog/katalog.py <tarayici_yolu>
Çıktı:     Daisy-Patisserie-Katalog.pdf (depo kökünde)
"""
import html, json, os, re, shutil, subprocess, sys, tempfile
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "Daisy-Patisserie-Katalog.pdf")
BROWSER = sys.argv[1] if len(sys.argv) > 1 else "google-chrome"

STR = r'("(?:[^"\\]|\\.)*")'
src = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
block = re.search(r"const PRODUCT_DATA = \[\n(.*?)\n\];", src, re.S).group(1)
prods = []
for line in block.split("\n"):
    g = lambda k: json.loads(re.search(k + ": " + STR, line).group(1))
    b = lambda k: re.search(k + r": (true|false)", line).group(1) == "true"
    prods.append({"img": g("img"), "tag": g("tag"), "name": g("name"), "desc": g("desc"),
                  "frozen": b("frozen"), "isWhole": b("isWhole")})

GROUPS = [
    ("Tatlılar", [("Cheesecake", ["Cheesecake"]), ("Pastalar", ["Pasta"]), ("Brownie", ["Brownie"]),
                  ("Cup Tatlılar", ["Cup Dessert", "Tiramisu", "Sütlaç"])]),
    ("Sandviç & Tost", [("Panini", ["Panini"]), ("Aperto", ["Aperto"]), ("Bagel", ["Bagel"]), ("Bunwich", ["Bunwich"]),
                        ("Gurme Sandviçler", ["Gurme Sandviç"]), ("Tostlar", ["Tost"]), ("Kruvasanlar", ["Unlu Mamul"])]),
]
known = {t for _, subs in GROUPS for _, tags in subs for t in tags}
others = [p for p in prods if p["tag"] not in known]
if others:
    GROUPS.append(("Diğer Ürünler", [("", sorted({p["tag"] for p in others}))]))

tmp = tempfile.mkdtemp(prefix="katalog-")
def small(rel, size=440):
    dst = os.path.join(tmp, os.path.basename(rel).rsplit(".", 1)[0] + ".jpg")
    if not os.path.exists(dst):
        im = Image.open(os.path.join(ROOT, rel)).convert("RGB")
        im.thumbnail((size, size), Image.LANCZOS)
        im.save(dst, quality=82, optimize=True, progressive=True)
    return "file:///" + dst.replace("\\", "/")

E = html.escape
def item(p):
    badges = ['<span class="b">' + ("Donuk" if p["frozen"] else "Taze") + "</span>"]
    if p["isWhole"]:
        badges.append('<span class="b">1 bütün · ~10-12 dilim</span>')
    return f'''<div class="it"><img src="{small(p["img"])}" alt="">
<div class="tx"><h3>{E(p["name"])}</h3>
<div class="bs">{"".join(badges)}</div><p>{E(p["desc"])}</p></div></div>'''

body = []
for gname, subs in GROUPS:
    parts = []
    for sname, tags in subs:
        items = [p for p in prods if p["tag"] in tags]
        if not items:
            continue
        head = f'<h2 class="sub">{E(sname)}</h2>' if sname else ""
        parts.append(f'<section class="cat">{head}<div class="grid">{"".join(item(p) for p in items)}</div></section>')
    if parts:
        body.append(f'<div class="grp{" ilk" if not body else ""}"><div class="gh"><span>{E(gname)}</span></div>{"".join(parts)}</div>')

logo = "file:///" + os.path.join(ROOT, "img", "site-logo-yesil.png").replace("\\", "/")
kapak = small("img/site-hero-2.jpg", 1000)
n = len(prods)

page = f'''<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"><title>Daisy Patisserie Ürün Kataloğu</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@page {{ size:A4; margin:12mm 13mm 15mm;
  @bottom-left {{ content:"Daisy Patisserie · Ürün Kataloğu"; font:8pt 'DM Sans',sans-serif; color:#8a8f84; letter-spacing:.06em; }}
  @bottom-right {{ content:counter(page); font:8pt 'DM Sans',sans-serif; color:#8a8f84; }} }}
@page :first {{ margin:0; @bottom-left {{ content:none; }} @bottom-right {{ content:none; }} }}
* {{ margin:0; padding:0; box-sizing:border-box; }}
html {{ -webkit-print-color-adjust:exact; print-color-adjust:exact; }}
body {{ font-family:'DM Sans',sans-serif; color:#2f3a28; font-size:9pt; }}
.cover {{ width:210mm; height:297mm; background:#78886b; color:#fff; display:flex; flex-direction:column; align-items:center; text-align:center; page-break-after:always; overflow:hidden; }}
.cover .logo {{ width:78mm; margin-top:26mm; }}
.cover h1 {{ font-family:'Cormorant Garamond',serif; font-weight:400; font-size:30pt; letter-spacing:.16em; text-transform:uppercase; margin-top:8mm; }}
.cover .alt {{ font-size:10pt; letter-spacing:.28em; text-transform:uppercase; margin-top:4mm; opacity:.92; }}
.cover .foto {{ width:118mm; height:118mm; object-fit:cover; margin-top:12mm; border:5px solid rgba(255,255,255,.85); }}
.cover .ilt {{ margin-top:auto; margin-bottom:16mm; font-size:9.5pt; line-height:1.75; letter-spacing:.04em; }}
.cover .ilt b {{ font-weight:600; }}
.intro {{ font-family:'Cormorant Garamond',serif; font-size:13pt; line-height:1.5; color:#4f5f42; text-align:center; max-width:150mm; margin:0 auto 7mm; }}
.grp {{ page-break-before:always; }}
.grp.ilk {{ page-break-before:auto; }}
.gh {{ display:flex; align-items:center; gap:5mm; margin-bottom:5mm; }}
.gh::before, .gh::after {{ content:""; flex:1; height:1px; background:#c9d1bf; }}
.gh span {{ font-family:'Cormorant Garamond',serif; font-size:23pt; letter-spacing:.14em; text-transform:uppercase; color:#4f5f42; }}
h2.sub {{ font-size:8.5pt; font-weight:600; letter-spacing:.24em; text-transform:uppercase; color:#78886b; margin:5mm 0 3mm; padding-bottom:1.5mm; border-bottom:1px solid #e3e7dc; break-after:avoid; }}
.grid {{ display:grid; grid-template-columns:1fr 1fr; gap:3.2mm 6mm; }}
.it {{ display:flex; gap:4mm; break-inside:avoid; align-items:flex-start; }}
.it img {{ width:31mm; height:31mm; object-fit:cover; flex:none; background:#f3f1ec; }}
.tx {{ flex:1; min-width:0; }}
.tg {{ font-size:6.8pt; letter-spacing:.2em; text-transform:uppercase; color:#78886b; }}
h3 {{ font-family:'Cormorant Garamond',serif; font-weight:600; font-size:13.5pt; line-height:1.1; margin:.6mm 0 1.2mm; color:#2f3a28; }}
.bs {{ display:flex; flex-wrap:wrap; gap:1.2mm; margin-bottom:1.4mm; }}
.b {{ font-size:6.6pt; letter-spacing:.1em; text-transform:uppercase; border:1px solid #c9d1bf; color:#4f5f42; padding:.4mm 1.6mm; }}
p {{ font-size:8.2pt; line-height:1.38; color:#555c50; }}
.son {{ break-inside:avoid; margin-top:10mm; background:#78886b; color:#fff; text-align:center; padding:8mm 10mm; }}
.son h2 {{ font-family:'Cormorant Garamond',serif; font-weight:400; font-size:19pt; letter-spacing:.08em; margin-bottom:2.5mm; }}
.son p {{ color:#fff; font-size:9.5pt; line-height:1.7; }}
</style></head><body>
<div class="cover">
  <img class="logo" src="{logo}" alt="Daisy Patisserie">
  <h1>Ürün Kataloğu</h1>
  <div class="alt">Toptan Tatlı · Sandviç · Tost</div>
  <img class="foto" src="{kapak}" alt="">
  <div class="ilt"><b>WhatsApp:</b> 0531 857 52 58 &nbsp;·&nbsp; <b>Web:</b> www.daisypatisserie.com &nbsp;·&nbsp; <b>Instagram:</b> @daisypatisserie_<br>
  Kayaşehir – Başakşehir / İstanbul &nbsp;·&nbsp; İstanbul geneline soğuk zincirle teslimat</div>
</div>
<p class="intro">Kafe, restoran, otel ve işletmeler için el yapımı tatlılar, sandviç ve tost çeşitleri. Bu katalogda {n} ürünümüzü bulabilirsiniz.</p>
{"".join(body)}
<div class="son"><h2>Fiyat ve sipariş için bize ulaşın</h2>
<p>WhatsApp: 0531 857 52 58 · daisy.patisseriee@gmail.com<br>www.daisypatisserie.com · Instagram: @daisypatisserie_</p></div>
</body></html>'''

hp = os.path.join(tmp, "katalog.html")
open(hp, "w", encoding="utf-8").write(page)
prof = os.path.join(tmp, "profil")
tmp_pdf = os.path.join(tmp, "katalog.pdf")
subprocess.run([BROWSER, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run", f"--user-data-dir={prof}",
                "--no-pdf-header-footer", "--virtual-time-budget=20000", "--allow-file-access-from-files",
                f"--print-to-pdf={tmp_pdf}", "file:///" + hp.replace("\\", "/")], check=True, timeout=180,
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
assert os.path.getsize(tmp_pdf) > 50000, "PDF beklenenden küçük"
shutil.copy(tmp_pdf, OUT)
print("urun:", n, "pdf KB:", os.path.getsize(OUT) // 1024, "html:", hp)
