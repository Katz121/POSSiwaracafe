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
import { lookupMemberByPhone } from '../services/memberLookup';
import { Coffee, Search, Star, ArrowRight } from 'lucide-react';
// firestore/lite read (1 doc) · keeps the full Firestore SDK off this page.
import { appId } from '../services/firebaseCore';
import { liteDb, menuLiteReader } from '../services/firebaseLite';
import useAuth from '../hooks/useAuth';
import { fetchPublicMenu } from '../utils/publicMenu';
import { MEMBER_MIN_PHONE_LENGTH } from '../config/constants';

const PHONE_KEY = 'siwara_member_phone';
const ORDER_URL = '/order';

// 0812345678 → 081-xxx-5678 (the card may be shown to staff or on a shared screen)
const maskPhone = (p = '') => (p.length >= 10 ? `${p.slice(0, 3)}-xxx-${p.slice(-4)}` : p);

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
        const bundle = await fetchPublicMenu(liteDb, appId, menuLiteReader);
        if (cancelled || !bundle?.settings) return;
        setThreshold(Number(bundle.settings.redeemPointsThreshold) || 50);
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
      const data = await lookupMemberByPhone(clean);
      if (data.exists) {
        setMember({ id: clean, phone: clean, name: data.name, points: data.points, pendingPoints: data.pendingPoints, pointsExpireAt: data.pointsExpireAt });
      } else {
        setMember(null);
      }
      setChecked(true);
      try { localStorage.setItem(PHONE_KEY, clean); } catch { /* private mode */ }
    } catch (err) {
      if (String(err?.code || '').endsWith('resource-exhausted')) {
         setError('ลองใหม่อีกครั้งในอีกสักครู่นะคะ');
      } else {
         setError('เชื่อมต่อไม่ได้ ลองใหม่อีกครั้งนะคะ');
      }
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
    <div className="min-h-dvh bg-[var(--bg-canvas)] text-[var(--text-primary)] flex flex-col items-center px-4 pt-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <main className="w-full max-w-sm">

        <header className="flex items-center gap-3 mb-6">
          <span className="shrink-0 w-12 h-12 rounded-[var(--radius)] bg-[var(--surface-inverse)] text-[var(--text-on-inverse)] flex items-center justify-center" aria-hidden="true">
            <Coffee size={24} strokeWidth={1.8} />
          </span>
          <div>
            <h1 className="text-[length:var(--fs-2xl)] leading-[var(--lh-2xl)] font-bold">บัตรสมาชิก</h1>
            <p className="text-sm text-[var(--text-secondary)]">Siwara Cafe · ตะกั่วป่า</p>
          </div>
        </header>

        {/* ช่องกรอกเบอร์ · inputMode numeric เพื่อให้มือถือเด้งแป้นตัวเลขขึ้นมาเลย */}
        <form
          className="bg-[var(--bg-surface)] rounded-[var(--radius-lg)] p-4 shadow-[var(--elev-1)]"
          onSubmit={(e) => { e.preventDefault(); lookup(); }}
        >
          <label htmlFor="member-phone" className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">
            เบอร์โทรที่ใช้สะสมแต้ม
          </label>
          <div className="flex gap-2">
            <input
              id="member-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              enterKeyHint="search"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
              placeholder="08x xxx xxxx"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'member-phone-error' : undefined}
              className="flex-1 min-w-0 min-h-12 rounded-[var(--radius-sm)] border border-[var(--border-strong)] px-3 text-lg tracking-wider
                         bg-[var(--bg-sunken)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--bg-surface)]"
            />
            <button
              type="submit"
              disabled={loading}
              className="shrink-0 min-h-12 px-4 rounded-[var(--radius-sm)] bg-[var(--accent)] text-[var(--text-on-accent)] font-semibold
                         flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
            >
              <Search size={18} aria-hidden="true" />
              {loading ? 'กำลังดู' : 'เช็คแต้ม'}
            </button>
          </div>
          {error && <p id="member-phone-error" role="alert" className="text-sm text-[var(--state-danger)] mt-2">{error}</p>}
        </form>

        <div aria-live="polite">
          {checked && member && (
            <section className="mt-4 bg-[var(--surface-inverse)] text-[var(--text-on-inverse)] rounded-[var(--radius-lg)] p-5 shadow-[var(--elev-2)]" aria-label="แต้มสะสม">
              <div className="flex items-start justify-between gap-3 mb-5">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#FCD34D]">สมาชิก</p>
                  <p className="text-xl font-bold leading-snug break-words">{member.name || 'ลูกค้าประจำ'}</p>
                </div>
                <p className="shrink-0 text-sm opacity-80 num tracking-wider pt-4">{maskPhone(member.phone)}</p>
              </div>

              <div className="flex items-end gap-2 mb-3">
                <span className="text-6xl font-bold leading-[1.1] num">{points}</span>
                <span className="text-lg mb-1 text-[#FCD34D]">แต้ม</span>
              </div>

              <div
                className="h-2.5 rounded-full bg-white/15 overflow-hidden mb-3"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={threshold}
                aria-valuenow={Math.min(points, threshold)}
                aria-label={`สะสม ${Math.min(points, threshold)} จาก ${threshold} แต้ม`}
              >
                <div className="h-full bg-[#FCD34D] rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>

              {ready ? (
                <p className="text-sm font-semibold text-[#FCD34D] flex items-start gap-1.5 leading-relaxed">
                  <Star size={16} fill="currentColor" className="shrink-0 mt-0.5" aria-hidden="true" />
                  ครบแล้ว แลกส่วนลด ฿{discount} ได้เลย แจ้งพนักงานตอนสั่งได้เลยค่ะ
                </p>
              ) : (
                <p className="text-sm opacity-90">
                  อีก <span className="num font-semibold">{remaining}</span> แต้ม แลกส่วนลด ฿{discount} ได้
                </p>
              )}

              {member.pointsExpireAt && (
                <p className="text-sm text-[#FCD34D] mt-3 pt-3 border-t border-white/15">
                  แต้มจะหมดอายุ {new Date(member.pointsExpireAt).toLocaleDateString('th-TH')} ถ้าไม่มาซื้อก่อน
                </p>
              )}
              {pending > 0 && (
                <p className="text-sm opacity-90 mt-3 pt-3 border-t border-white/15">
                  มีอีก {pending} แต้มจากบิลล่าสุด รอทางร้านยืนยัน เดี๋ยวเข้าบัตรให้ค่ะ
                </p>
              )}
            </section>
          )}

          {checked && !member && (
            <section className="mt-4 bg-[var(--bg-surface)] rounded-[var(--radius-lg)] p-5 shadow-[var(--elev-1)] text-center">
              <p className="font-semibold mb-2">ยังไม่มีแต้มของเบอร์นี้</p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                สั่งครั้งหน้าใส่เบอร์นี้ตอนสั่ง ระบบจะเปิดบัตรสมาชิกให้อัตโนมัติ
                แล้วเริ่มสะสมแต้มตั้งแต่บิลแรกเลยค่ะ
              </p>
            </section>
          )}
        </div>

        <a
          href={ORDER_URL}
          className="mt-4 w-full min-h-14 rounded-[var(--radius)] bg-[var(--accent)] text-[var(--text-on-accent)] font-semibold text-base
                     flex items-center justify-center gap-2 active:scale-[0.98] transition-transform shadow-[var(--elev-1)]"
        >
          สั่งล่วงหน้า
          <ArrowRight size={18} aria-hidden="true" />
        </a>

        <p className="text-xs text-[var(--text-muted)] text-center mt-6 leading-relaxed">
          แต้มผูกกับเบอร์โทร · สั่งครั้งไหนใส่เบอร์เดิม แต้มสะสมต่อให้เอง
        </p>
      </main>
    </div>
  );
}
