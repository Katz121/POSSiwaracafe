/**
 * บัตรสมาชิกสำหรับลูกค้า · เปิดจากช่อง "สะสมแต้ม" ในริชเมนู LINE ของร้าน
 *
 * ทำไมเป็นหน้าเว็บธรรมดาไม่ใช่ LIFF: LIFF ต้องผูกกับ LINE Login channel ซึ่งร้านยังไม่มี
 * (ตอนนี้มีแต่ Messaging API channel) · หน้านี้เลยใช้เบอร์โทรเป็นตัวตนแบบเดียวกับที่
 * หน้าสั่งอาหารใช้อยู่ [เบอร์ = id สมาชิก] ลูกค้ากรอกเบอร์แล้วเห็นแต้มตัวเองได้ทันที
 * ไม่ต้องรอแอดมินมาตอบในแชท
 *
 * ต้นทุน Firestore: 2 read ต่อการเปิดหนึ่งครั้ง (publicMenu สำหรับเกณฑ์แลกแต้ม +
 * เอกสารสมาชิก 1 ใบ) · จำเบอร์ไว้ในเครื่อง เปิดครั้งต่อไปกดปุ่มเดียวจบ
 */
import React, { useCallback, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Coffee, Search, Star, ArrowRight } from 'lucide-react';
import { db, appId } from '../services/firebase';
import useAuth from '../hooks/useAuth';
import { fetchPublicMenu } from '../utils/publicMenu';
import { MEMBER_MIN_PHONE_LENGTH } from '../config/constants';

const PHONE_KEY = 'siwara_member_phone';
const ORDER_URL = '/order';

export default function MemberCardApp() {
  const user = useAuth();
  const [phone, setPhone] = useState('');
  const [member, setMember] = useState(null);
  const [checked, setChecked] = useState(false); // ค้นแล้วอย่างน้อยหนึ่งครั้ง
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [threshold, setThreshold] = useState(100);
  const [discount, setDiscount] = useState(50);

  useEffect(() => {
    document.title = 'บัตรสมาชิก · Siwara Cafe';
    try {
      const saved = localStorage.getItem(PHONE_KEY);
      if (saved) setPhone(saved);
    } catch { /* private mode */ }
  }, []);

  // เกณฑ์แลกแต้มมาจากค่าที่ร้านตั้งไว้ ไม่ hardcode — ร้านปรับเมื่อไหร่หน้านี้ตามทันที
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const bundle = await fetchPublicMenu(db, appId);
        if (cancelled || !bundle?.settings) return;
        setThreshold(Number(bundle.settings.redeemPointsThreshold) || 100);
        setDiscount(Number(bundle.settings.redeemDiscountValue) || 50);
      } catch { /* ใช้ค่าเริ่มต้นไปก่อน ไม่ใช่เรื่องคอขาดบาดตาย */ }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const lookup = useCallback(async () => {
    const clean = phone.replace(/[^0-9]/g, '');
    if (clean.length < MEMBER_MIN_PHONE_LENGTH) {
      setError('กรอกเบอร์โทรให้ครบก่อนนะคะ');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'members', clean));
      setMember(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setChecked(true);
      try { localStorage.setItem(PHONE_KEY, clean); } catch { /* private mode */ }
    } catch {
      setError('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้งนะคะ');
    } finally {
      setLoading(false);
    }
  }, [phone]);

  const points = Number(member?.points || 0);
  // แต้มที่เพิ่งได้จากบิลล่าสุดยังไม่ถูกนับ จนกว่าเจ้าของร้านจะกดอนุมัติในหน้าจัดการสมาชิก
  // ถ้าไม่บอกตรงนี้ ลูกค้าที่เพิ่งสั่งเสร็จจะเห็นเลขไม่ขยับแล้วนึกว่าระบบพัง
  const pending = Number(member?.pendingPoints || 0);
  const ready = points >= threshold;
  const remaining = Math.max(threshold - points, 0);
  const progress = Math.min((points / threshold) * 100, 100);

  return (
    <div className="min-h-screen bg-[#f4ead8] text-[#2b1a10] flex flex-col items-center px-5 py-10">
      <div className="w-full max-w-sm">

        <header className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#4a2f1c] text-[#d9b878] mx-auto flex items-center justify-center mb-4">
            <Coffee size={26} strokeWidth={1.8} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">บัตรสมาชิก</h1>
          <p className="text-sm text-[#6b4226] mt-1">Siwara Cafe · ตะกั่วป่า</p>
        </header>

        {/* ช่องกรอกเบอร์ · inputMode numeric เพื่อให้มือถือเด้งแป้นตัวเลขขึ้นมาเลย */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#e0d2b8]">
          <label htmlFor="member-phone" className="block text-xs font-semibold text-[#6b4226] mb-2">
            เบอร์โทรที่ใช้สะสมแต้ม
          </label>
          <div className="flex gap-2">
            <input
              id="member-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
              onKeyDown={(e) => { if (e.key === 'Enter') lookup(); }}
              placeholder="08x xxx xxxx"
              className="flex-1 min-w-0 rounded-xl border border-[#e0d2b8] px-3 py-3 text-base tracking-wider
                         focus:outline-none focus:border-[#c79a52] bg-[#fffdf8]"
            />
            <button
              onClick={lookup}
              disabled={loading}
              className="shrink-0 px-4 rounded-xl bg-[#4a2f1c] text-[#f4ead8] font-semibold text-sm
                         flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
            >
              <Search size={16} />
              {loading ? 'กำลังดู' : 'เช็คแต้ม'}
            </button>
          </div>
          {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        </div>

        {checked && member && (
          <div className="mt-5 bg-[#4a2f1c] text-[#f4ead8] rounded-3xl p-6 shadow-lg">
            <p className="text-xs uppercase tracking-[.25em] text-[#c79a52] mb-2">สมาชิก</p>
            <p className="text-xl font-bold mb-6">{member.name || 'ลูกค้าประจำ'}</p>

            <div className="flex items-end gap-2 mb-3">
              <span className="text-6xl font-bold leading-none">{points}</span>
              <span className="text-lg mb-1.5 text-[#d9b878]">แต้ม</span>
            </div>

            <div className="h-2 rounded-full bg-[#2b1a10] overflow-hidden mb-3">
              <div className="h-full bg-[#c79a52] rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>

            {ready ? (
              <p className="text-sm font-semibold text-[#d9b878] flex items-center gap-1.5">
                <Star size={15} fill="currentColor" />
                ครบแล้ว แลกส่วนลด ฿{discount} ได้เลย แจ้งพนักงานตอนสั่งได้เลยค่ะ
              </p>
            ) : (
              <p className="text-sm text-[#e7d6ba]">
                อีก {remaining} แต้ม แลกส่วนลด ฿{discount} ได้
              </p>
            )}

            {pending > 0 && (
              <p className="text-xs text-[#c79a52] mt-3 pt-3 border-t border-[#2b1a10]">
                มีอีก {pending} แต้มจากบิลล่าสุด รอทางร้านยืนยัน เดี๋ยวเข้าบัตรให้ค่ะ
              </p>
            )}
          </div>
        )}

        {checked && !member && (
          <div className="mt-5 bg-white rounded-3xl p-6 shadow-sm border border-[#e0d2b8] text-center">
            <p className="font-semibold mb-2">ยังไม่มีแต้มของเบอร์นี้</p>
            <p className="text-sm text-[#6b4226] leading-relaxed">
              สั่งครั้งหน้าใส่เบอร์นี้ตอนสั่ง ระบบจะเปิดบัตรสมาชิกให้อัตโนมัติ
              แล้วเริ่มสะสมแต้มตั้งแต่บิลแรกเลยค่ะ
            </p>
          </div>
        )}

        <a
          href={ORDER_URL}
          className="mt-5 w-full rounded-2xl bg-[#c79a52] text-[#2b1a10] font-semibold py-4
                     flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          สั่งล่วงหน้า
          <ArrowRight size={18} />
        </a>

        <p className="text-[11px] text-[#8a7b66] text-center mt-6 leading-relaxed">
          แต้มผูกกับเบอร์โทร · สั่งครั้งไหนใส่เบอร์เดิม แต้มสะสมต่อให้เอง
        </p>
      </div>
    </div>
  );
}
