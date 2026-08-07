"""ดูรายชื่อคนที่แอด LINE OA ของร้าน

    set NOTIFY_SHARED_SECRET=...
    python line/followers.py

รายชื่อนี้ worker เก็บเองตอนมี event เข้ามา (LINE ไม่ให้ดึงรายชื่อผู้ติดตามย้อนหลัง
สำหรับบัญชีที่ยังไม่ verified) · คนที่แอดไว้ก่อนระบบนี้เปิดและไม่เคยทักมา จะยังไม่โผล่
"""
import json
import os
import sys
import urllib.request

URL = os.environ.get("NOTIFY_URL", "https://pos-gemini-proxy.siwatid-99.workers.dev/followers")
SECRET = os.environ.get("NOTIFY_SHARED_SECRET")
if not SECRET:
    sys.exit("ไม่พบ NOTIFY_SHARED_SECRET ใน environment (ค่าเดียวกับใน .env ฝั่งแอป)")

req = urllib.request.Request(URL, data=b"", headers={"Authorization": f"Bearer {SECRET}"})
with urllib.request.urlopen(req) as r:
    data = json.load(r)

print(f"ผู้ติดตามที่ระบบรู้จัก {data['count']} คน (ยังไม่บล็อก {data['active']} คน)\n")
for p in data["people"]:
    mark = "  บล็อกแล้ว" if p.get("unfollowedAt") else ""
    print(f"{p['displayName']}{mark}")
    print(f"  {p['userId']}")
    print(f"  แอดเมื่อ {p['firstSeenAt'][:16].replace('T', ' ')} · เห็นล่าสุด {p['lastSeenAt'][:16].replace('T', ' ')}")
    print()
