import { useState } from 'react';
import { Coffee, LockKeyhole, UserRound } from 'lucide-react';
import { auth } from '../services/firebase';
import { signInStaff } from '../services/staffAuth';
import { Button, Input } from './ui';

const AUTH_ERROR_MESSAGES = {
  'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'auth/too-many-requests': 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่',
  'auth/network-request-failed': 'เชื่อมต่อไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต',
  'auth/operation-not-allowed': 'ยังไม่ได้เปิด Email/Password ใน Firebase Authentication',
};

export default function StaffLogin() {
  const [staffId, setStaffId] = useState('siwara');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await signInStaff(auth, staffId, password);
    } catch (authError) {
      console.error('Staff sign-in failed', authError);
      setError(
        authError.message === 'invalid-staff-id'
          ? 'ID ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข จุด ขีดกลาง และขีดล่าง'
          : AUTH_ERROR_MESSAGES[authError.code] || 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center overflow-hidden px-4">
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-sky-50 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950" />
      <div className="absolute top-1/4 left-1/3 w-80 h-80 rounded-full blur-3xl opacity-60 bg-emerald-200/50 dark:bg-emerald-500/10" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 rounded-full blur-3xl opacity-50 bg-teal-200/50 dark:bg-teal-500/10" />

      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-sm rounded-[var(--radius)] border border-[var(--border-color)] bg-[var(--bg-secondary)]/75 px-8 py-8 shadow-[var(--elev-3)] backdrop-blur-2xl"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_8px_24px_rgba(16,185,129,0.40)]">
            <Coffee size={30} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">SIWARA</h1>
          <p className="mt-1 text-xs font-semibold tracking-[0.18em] text-emerald-500 uppercase">Staff Sign In</p>
        </div>

        <div className="space-y-4">
          <Input
            label="ID"
            type="text"
            value={staffId}
            onChange={(event) => setStaffId(event.target.value)}
            leftIcon={<UserRound size={18} />}
            autoComplete="username"
            required
          />
          <Input
            label="รหัสผ่าน"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            leftIcon={<LockKeyhole size={18} />}
            autoComplete="current-password"
            error={error}
            required
          />
          <Button type="submit" size="lg" fullWidth loading={isSubmitting} noUppercase>
            เข้าสู่ระบบพนักงาน
          </Button>
        </div>
      </form>
    </div>
  );
}
