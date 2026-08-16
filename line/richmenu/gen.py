"""สร้าง HTML ริชเมนู Siwara Cafe 3 แบบ · เรนเดอร์เป็น PNG 2500x1686 ด้วย

    python D:/workFull/scripts/render_covers_png.py --width 1250 --height 843 \
        "D:/code pos/my-pos-app/line/richmenu/a-wood.html"

พาเลตกับฟอนต์ล้อเว็บร้านจริง (siwaracafe.com): ไม้สัก · ครีม · ทอง · Chonburi
"""
from pathlib import Path

HERE = Path(__file__).parent

S = 'stroke="currentColor" fill="none" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"'

ICONS = {
    # แก้วกาแฟร้อนมีจานรอง + ไอลอย · สื่อ "สั่งล่วงหน้า แล้วมารับ"
    "cup": f'<svg viewBox="0 0 100 100">'
           f'<path d="M20 38h50v22a25 25 0 0 1-25 25h0a25 25 0 0 1-25-25V38z" {S}/>'
           f'<path d="M70 44h6a11 11 0 0 1 0 22h-6" {S}/>'
           f'<path d="M14 90h62" {S}/>'
           f'<path d="M36 26c0-5 4-6 4-11M50 26c0-5 4-6 4-11M64 26c0-5 4-6 4-11" {S}/></svg>',
    # เล่มเมนูเปิดอยู่ มีบรรทัดราคา
    "menu": f'<svg viewBox="0 0 100 100">'
            f'<path d="M50 28C40 20 26 19 14 22v54c12-3 26-2 36 6 10-8 24-9 36-6V22c-12-3-26-2-36 6z" {S}/>'
            f'<path d="M50 28v54" {S}/>'
            f'<path d="M24 38h16M24 50h16M24 62h10M60 38h16M60 50h16M60 62h10" {S}/></svg>',
    # บัตรสะสมแต้ม · ช่องแสตมป์ + ดาวที่ประทับแล้ว
    "stamp": f'<svg viewBox="0 0 100 100">'
             f'<rect x="10" y="24" width="80" height="52" rx="8" {S}/>'
             f'<path d="M10 40h80" {S}/>'
             f'<circle cx="30" cy="58" r="9" {S}/><circle cx="50" cy="58" r="9" {S}/>'
             f'<circle cx="70" cy="58" r="9" {S}/>'
             f'<path d="M30 53l1.9 3.9 4.3.6-3.1 3 .7 4.2-3.8-2-3.8 2 .7-4.2-3.1-3 4.3-.6z" '
             f'fill="currentColor" stroke="none"/></svg>',
    # หมุดแผนที่
    "pin": f'<svg viewBox="0 0 100 100">'
           f'<path d="M50 92C50 92 78 64 78 42a28 28 0 1 0-56 0c0 22 28 50 28 50z" {S}/>'
           f'<circle cx="50" cy="41" r="11" {S}/></svg>',
}

# ภาพถ่ายจริงของร้าน (คัดจากเว็บ siwaracafe.com) แทนไอคอนใน 2 ช่อง
ART = {
    "__cake__": '<img class="photo round" src="assets/cake.jpg" alt="">',
    "__house__": '<img class="photo house" src="assets/house.jpg" alt="">',
}

# (art key, EN, TH) · เรียงซ้าย→ขวา บน→ล่าง · แถวบน = ปุ่มที่ลูกค้ากดบ่อยสุด
CELLS = [
    ("cup", "ORDER AHEAD", "สั่งล่วงหน้า"),
    ("menu", "OUR MENU", "เมนู & ราคา"),
    ("stamp", "MEMBER", "สะสมแต้ม"),
    ("__cake__", "CAKE ORDER", "เค้กสั่งทำ"),
    ("pin", "FIND US", "แผนที่ร้าน"),
    ("__house__", "OUR STORY", "เรื่องเล่าบ้านไม้"),
]

PAL = dict(wood="#4a2f1c", wood_dark="#2b1a10", wood_mid="#6b4226",
           paper="#e7d6ba", cream="#f4ead8", cream_soft="#efe2cd",
           gold="#c79a52", gold_soft="#d9b878", leaf="#5d6b4a", ink="#33251a")

VARIANTS = {
    "a-wood": {
        "note": "พื้นไม้สักเข้ม อักษรครีม-ทอง · หรูแบบในร้าน",
        "skin": [(PAL["wood"], PAL["cream"])] * 6,
        "extra": """
body{background:#4a2f1c}
.cell{border-right:2px solid rgba(199,154,82,.42);border-bottom:2px solid rgba(199,154,82,.42)}
.cell:nth-child(3n){border-right:0}
.cell:nth-child(n+4){border-bottom:0}
/* ไล่เฉดไม้ทีละช่องนิดเดียว ให้ไม่แบนเป็นสีเดียวทั้งแผ่น */
.cell:nth-child(2),.cell:nth-child(4),.cell:nth-child(6){background:#452b19}
.ico{color:#d9b878}
.en{color:#c79a52}
""",
    },
    "b-cream": {
        "note": "พื้นครีมกระดาษ หมึกไม้เข้ม เส้นทองบาง · สว่าง อ่านง่ายบนมือถือ",
        "skin": [(PAL["cream"], PAL["wood_dark"])] * 6,
        "extra": """
body{background:#f4ead8}
.cell{border-right:2px solid rgba(199,154,82,.55);border-bottom:2px solid rgba(199,154,82,.55)}
.cell:nth-child(3n){border-right:0}
.cell:nth-child(n+4){border-bottom:0}
.cell:nth-child(2n){background:#efe2cd}
.ico{color:#6b4226}
.en{color:#a8813f}
""",
    },
    "c-block": {
        "note": "สลับบล็อกไม้-ครีม-ทอง · ช่องสั่งล่วงหน้าเด่นสุด",
        "skin": [
            (PAL["wood"], PAL["cream"]),        # สั่งล่วงหน้า
            (PAL["cream"], PAL["wood_dark"]),   # เมนู
            (PAL["gold"], PAL["wood_dark"]),    # สะสมแต้ม
            (PAL["cream_soft"], PAL["wood_dark"]),  # เค้ก
            (PAL["leaf"], PAL["cream"]),        # แผนที่
            (PAL["wood_dark"], PAL["cream"]),   # เรื่องเล่า
        ],
        "extra": """
.cell{box-shadow:0 0 0 2px rgba(43,26,16,.10) inset}
.cell:nth-child(1) .ico{color:#d9b878}
.cell:nth-child(2) .ico{color:#6b4226}
.cell:nth-child(3) .ico{color:#2b1a10}
.cell:nth-child(5) .ico{color:#f4ead8}
.en{opacity:.82}
""",
    },
}

HEAD = """<!doctype html><html lang="th"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Chonburi&family=Sarabun:wght@400;600;700&family=Cormorant+Garamond:wght@600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="_base.css">
<style>%s</style></head><body>
"""

for name, v in VARIANTS.items():
    rows = []
    for (key, en, th), (bg, fg) in zip(CELLS, v["skin"]):
        inner = ART.get(key) or f'<div class="ico">{ICONS[key]}</div>'
        rows.append(
            f'<div class="cell" style="background:{bg};color:{fg}">'
            f'<div class="art">{inner}</div>'
            f'<div><div class="en">{en}</div><div class="th">{th}</div></div></div>'
        )
    html = HEAD % v["extra"] + "\n".join(rows) + "\n</body></html>"
    out = HERE / f"{name}.html"
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out.name}  ({v['note']})")
