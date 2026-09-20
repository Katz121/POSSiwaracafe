"""อัปโหลดริชเมนู Siwara Cafe ขึ้น LINE OA (@639gyrjn) แล้วตั้งเป็นเมนูหลักของทุกคน

ใช้:
    # ออก token จาก channel id/secret ให้อัตโนมัติ (หรือ set LINE_CHANNEL_ACCESS_TOKEN เองก็ได้)
    set LINE_CHANNEL_ID=2007854865
    set LINE_CHANNEL_SECRET=...
    python line/richmenu/deploy.py line/richmenu/d-cafe7.png

ทำอะไรบ้าง: สร้าง rich menu → อัปรูป → ตั้งเป็น default → ลบเมนูเก่าที่ไม่ใช้แล้ว
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

for _s in (sys.stdout, sys.stderr):   # คอนโซล Windows เป็น cp1252 · ไม่บังคับ utf-8 แล้ว print ไทยจะ crash
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

API = "https://api.line.me"
API_DATA = "https://api-data.line.me"


def issue_token():
    """token ตรงๆ ถ้ามี · ไม่งั้นออก short-lived token จาก channel id + secret
    (ทางเดียวกับที่ api-proxy/worker.js ใช้ตอนส่งแจ้งเตือนออเดอร์)"""
    tok = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN")
    if tok:
        return tok
    cid = os.environ.get("LINE_CHANNEL_ID")
    secret = os.environ.get("LINE_CHANNEL_SECRET")
    if not (cid and secret):
        sys.exit("ต้องมี LINE_CHANNEL_ACCESS_TOKEN หรือ LINE_CHANNEL_ID + LINE_CHANNEL_SECRET ใน environment")
    body = urllib.parse.urlencode({
        "grant_type": "client_credentials",
        "client_id": cid,
        "client_secret": secret,
    }).encode()
    req = urllib.request.Request(
        f"{API}/v2/oauth/accessToken", data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)["access_token"]


TOKEN = issue_token()

if not TOKEN.isascii() or len(TOKEN) < 40:   # กันเคสวางคำอธิบายมาแทนค่าจริง
    sys.exit("หยุด: ค่า token/secret ที่ใส่มายังเป็นข้อความตัวอย่าง ไม่ใช่ค่าจริงจาก LINE Developers Console")

# ปลายทางจริงทั้งหมด
# ⚠️ หน้าสั่งล่วงหน้า/สะสมแต้มอยู่บนแอป POS คนละโดเมนกับเว็บร้าน
#    siwaracafe.com/order และ /member = 404 (เช็คสดอีกครั้ง 2026-09-20) ห้ามกลับไปใช้
# UTM บอกว่าคนมาจากช่องไหนของริชเมนู · เว็บร้านมี GA4 (G-PRG04Y0WJF) อ่านค่าพวกนี้ได้เลย
# ฝั่ง POS (possiwaracafe.pages.dev) ไม่ได้อ่าน utm แต่ /qr-beacon บน worker นับ ua=line ให้อยู่แล้ว
# ⚠️ query ต้องมาก่อน # เสมอ ไม่งั้นมันกลายเป็นส่วนหนึ่งของ fragment แล้ว GA อ่านไม่เห็น
def utm(url, campaign):
    joiner = "&" if "?" in url.split("#")[0] else "?"
    base, _, frag = url.partition("#")
    q = f"utm_source=line&utm_medium=richmenu&utm_campaign={campaign}"
    return f"{base}{joiner}{q}" + (f"#{frag}" if frag else "")

POS = "https://possiwaracafe.pages.dev"
SITE = "https://siwaracafe.com"
ORDER = utm(f"{POS}/order", "oa_order")           # หน้าสั่งเองของลูกค้า (เดียวกับที่ QR ในร้านชี้ไป)
MEMBER = utm(f"{POS}/member", "oa_member")        # บัตรสมาชิก ลูกค้ากรอกเบอร์เช็คแต้มเอง
MENU = utm(f"{SITE}/#menu", "oa_menu")
STORY = utm(f"{SITE}/#cafe", "oa_story")
CAKE = utm(f"{SITE}/cake", "oa_cake")
CATERING = utm(f"{SITE}/cake#catering", "oa_catering")
TEL = "tel:0973501514"
# ลิงก์หมุดจริงของร้าน (ทางร้านส่งมาเอง) · Siwara Cafe · 53 ถ.ราษฎร์บำรุง ต.บางไทร
# อ.ตะกั่วป่า พังงา 82110 · ราว 8.8408064, 98.3629824
#
# ห้ามใช้พิกัดในแผนที่ที่ฝังอยู่ในหน้าเว็บร้าน (8.8332284, 98.3626267) — ห่างจากจุดจริง
# ประมาณ 850 เมตร ของนั้นต้องแก้ที่ D:\Siwaracafeweb\index.html ด้วย
MAPS = "https://maps.app.goo.gl/EmCpQ4hKVBHTm3vM9"

W, H = 2500, 1686

# ── เลย์เอาต์ ────────────────────────────────────────────────────────────────
# "cafe7" = ของที่ใช้อยู่ (ภาพ d-cafe7.png · 7 ช่องไม่เท่ากัน · คาเฟ่เป็นแกน)
#   พิกัดทุกช่องเขียนตรงตามภาพ ไม่ได้คำนวณจากลำดับเหมือนเลย์เอาต์เก่า
#   ⚠️ แก้ตรงนี้ต้องแก้ d-cafe7.html ให้ตรงกันเสมอ (ไฟล์ HTML เขียนที่ครึ่งสเกล 1250x843)
# "grid6" = ของเดิม 3x2 เท่ากัน (ภาพ a-wood.png / b-cream.png / c-block.png)
LAYOUTS = {
    "cafe7": [
        ("สั่งล่วงหน้า",  0,    0,   1250, 900, {"type": "uri", "uri": ORDER}),
        ("เมนู & ราคา",  1250, 0,   1250, 450, {"type": "uri", "uri": MENU}),
        ("สะสมแต้ม",     1250, 450, 625,  450, {"type": "uri", "uri": MEMBER}),
        ("โทรหาร้าน",    1875, 450, 625,  450, {"type": "uri", "uri": TEL}),
        ("เค้กสั่งทำ",    0,    900, 833,  786, {"type": "uri", "uri": CAKE}),
        ("จัดเบรก",      833,  900, 833,  786, {"type": "uri", "uri": CATERING}),
        ("แผนที่ร้าน",    1666, 900, 834,  786, {"type": "uri", "uri": MAPS}),
    ],
    "grid6": None,  # สร้างจากลำดับด้านล่าง (ของเดิม)
}

GRID6 = [
    ("สั่งล่วงหน้า", {"type": "uri", "uri": ORDER}),
    ("เมนู & ราคา", {"type": "uri", "uri": MENU}),
    ("สะสมแต้ม", {"type": "uri", "uri": MEMBER}),
    ("เค้กสั่งทำ", {"type": "uri", "uri": CAKE}),
    ("แผนที่ร้าน", {"type": "uri", "uri": MAPS}),
    ("เรื่องเล่าบ้านไม้", {"type": "uri", "uri": STORY}),
]

LAYOUT = os.environ.get("RICHMENU_LAYOUT", "cafe7")

if LAYOUT == "grid6":
    CW, CH = 833, 843
    areas = []
    for i, (label, action) in enumerate(GRID6):
        col, row = i % 3, i // 3
        x = col * CW
        areas.append({
            "bounds": {"x": x, "y": row * CH, "width": (W - x) if col == 2 else CW, "height": CH},
            "action": {**action, "label": label},
        })
else:
    areas = [
        {"bounds": {"x": x, "y": y, "width": w, "height": h}, "action": {**act, "label": label}}
        for (label, x, y, w, h, act) in LAYOUTS["cafe7"]
    ]

MENU_DEF = {
    "size": {"width": W, "height": H},
    "selected": True,          # เปิดเมนูค้างไว้ตอนเข้าแชท
    "name": "Siwara Cafe · เมนูหลัก",
    "chatBarText": "เมนูร้าน",
    "areas": areas,
}


def call(url, data=None, ctype="application/json", method=None):
    headers = {"Authorization": f"Bearer {TOKEN}"}
    if data is not None:
        headers["Content-Type"] = ctype
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req) as r:
        body = r.read().decode()
    return json.loads(body) if body.strip() else {}


def assert_channel(expect_basic, expect_premium):
    """กันอัปเมนูผิด OA · env อาจมี LINE_CHANNEL_ACCESS_TOKEN ของแอคอื่นค้างอยู่
    (เคยเกิดจริง 2026-09-20: token ของ @kuapapoh ค้างใน env แล้วเมนูศิวราขึ้นผิดแอคจนเมนูเดิมถูกลบ)"""
    req = urllib.request.Request(f"{API}/v2/bot/info", headers={"Authorization": f"Bearer {TOKEN}"})
    with urllib.request.urlopen(req) as r:
        info = json.load(r)
    got = (info.get("basicId"), info.get("premiumId"))
    if expect_basic not in got and expect_premium not in got:
        sys.exit(f"หยุด: token นี้เป็นของ {info.get('displayName')} {got} "
                 f"ไม่ใช่ {expect_premium} · unset LINE_CHANNEL_ACCESS_TOKEN แล้วใช้ CHANNEL_ID+SECRET ของแอคที่ถูก")
    print(f"ยืนยันแอค: {info.get('displayName')} {info.get('premiumId') or info.get('basicId')}")


assert_channel("@639gyrjn", "@siwara")

img = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).parent / "d-cafe7.png")

old = call(f"{API}/v2/bot/richmenu/list").get("richmenus", [])

rid = call(f"{API}/v2/bot/richmenu",
           json.dumps(MENU_DEF, ensure_ascii=False).encode())["richMenuId"]
print("สร้างเมนู:", rid)

ctype = "image/jpeg" if img.suffix.lower() in (".jpg", ".jpeg") else "image/png"
# LINE จำกัดรูปริชเมนูไม่เกิน 1 MB · PNG 2500x1686 ที่มีรูปถ่ายมักเกิน ให้ใช้ JPEG แทน
call(f"{API_DATA}/v2/bot/richmenu/{rid}/content", img.read_bytes(), ctype)
print("อัปรูป:", img.name, f"({img.stat().st_size // 1024} KB)")

call(f"{API}/v2/bot/user/all/richmenu/{rid}", b"", method="POST")
print("ตั้งเป็นเมนูหลักของทุกคนแล้ว")

for m in old:
    call(f"{API}/v2/bot/richmenu/{m['richMenuId']}", method="DELETE")
    print("ลบเมนูเก่า:", m["richMenuId"])
