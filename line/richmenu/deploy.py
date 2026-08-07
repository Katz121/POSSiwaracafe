"""อัปโหลดริชเมนู Siwara Cafe ขึ้น LINE OA (@639gyrjn) แล้วตั้งเป็นเมนูหลักของทุกคน

ใช้:
    # ออก token จาก channel id/secret ให้อัตโนมัติ (หรือ set LINE_CHANNEL_ACCESS_TOKEN เองก็ได้)
    set LINE_CHANNEL_ID=2007854865
    set LINE_CHANNEL_SECRET=...
    python line/richmenu/deploy.py line/richmenu/a-wood.png

ทำอะไรบ้าง: สร้าง rich menu → อัปรูป → ตั้งเป็น default → ลบเมนูเก่าที่ไม่ใช้แล้ว
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

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

# ปลายทางจริงทั้งหมด (เช็คแล้วว่าเปิดได้ 2026-08-07)
ORDER = "https://possiwaracafe.pages.dev/order"          # หน้าสั่งเองของลูกค้า (เดียวกับที่ QR ในร้านชี้ไป)
MEMBER = "https://possiwaracafe.pages.dev/member"        # บัตรสมาชิก ลูกค้ากรอกเบอร์เช็คแต้มเอง
SITE = "https://www.siwara.cafe"
MENU = f"{SITE}/#menu"
STORY = f"{SITE}/#cafe"
CAKE = f"{SITE}/cake"
# ลิงก์หมุดจริงของร้าน (ทางร้านส่งมาเอง) · Siwara Cafe · 53 ถ.ราษฎร์บำรุง ต.บางไทร
# อ.ตะกั่วป่า พังงา 82110 · ราว 8.8408064, 98.3629824
#
# ห้ามใช้พิกัดในแผนที่ที่ฝังอยู่ในหน้าเว็บร้าน (8.8332284, 98.3626267) — ห่างจากจุดจริง
# ประมาณ 850 เมตร ของนั้นต้องแก้ที่ D:\Siwaracafeweb\index.html ด้วย
MAPS = "https://maps.app.goo.gl/EmCpQ4hKVBHTm3vM9"

W, H = 2500, 1686
CW, CH = 833, 843  # ช่องละ 1/3 กว้าง · ครึ่งสูง (ช่องขวาสุดกว้าง 834 ให้เต็มพอดี)

# เรียงตาม CELLS ใน gen.py — ซ้าย→ขวา บน→ล่าง
ACTIONS = [
    ("สั่งล่วงหน้า", {"type": "uri", "uri": ORDER}),
    ("เมนู & ราคา", {"type": "uri", "uri": MENU}),
    ("สะสมแต้ม", {"type": "uri", "uri": MEMBER}),
    ("เค้กสั่งทำ", {"type": "uri", "uri": CAKE}),
    ("แผนที่ร้าน", {"type": "uri", "uri": MAPS}),
    ("เรื่องเล่าบ้านไม้", {"type": "uri", "uri": STORY}),
]

areas = []
for i, (label, action) in enumerate(ACTIONS):
    col, row = i % 3, i // 3
    x = col * CW
    areas.append({
        "bounds": {"x": x, "y": row * CH, "width": (W - x) if col == 2 else CW, "height": CH},
        "action": {**action, "label": label},
    })

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


img = Path(sys.argv[1] if len(sys.argv) > 1 else "line/richmenu/a-wood.png")

old = call(f"{API}/v2/bot/richmenu/list").get("richmenus", [])

rid = call(f"{API}/v2/bot/richmenu",
           json.dumps(MENU_DEF, ensure_ascii=False).encode())["richMenuId"]
print("สร้างเมนู:", rid)

call(f"{API_DATA}/v2/bot/richmenu/{rid}/content", img.read_bytes(), "image/png")
print("อัปรูป:", img.name, f"({img.stat().st_size // 1024} KB)")

call(f"{API}/v2/bot/user/all/richmenu/{rid}", b"", method="POST")
print("ตั้งเป็นเมนูหลักของทุกคนแล้ว")

for m in old:
    call(f"{API}/v2/bot/richmenu/{m['richMenuId']}", method="DELETE")
    print("ลบเมนูเก่า:", m["richMenuId"])
