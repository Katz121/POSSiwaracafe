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

  // Plain canvas + one surface card: no animated blobs or backdrop blur
  // (expensive on iPad GPUs, spec §2.1).
  return (
    <div className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center overflow-y-auto bg-[var(--bg-canvas)] px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-[var(--radius-lg)] bg-[var(--bg-surface)] px-6 py-8 sm:px-8 shadow-[var(--elev-2)]"
      >
        <div className="mb-7 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--radius)] bg-[var(--accent)] text-[var(--text-on-accent)]">
            <Coffee size={28} />
          </div>
          <h1 className="text-2xl font-semibold leading-snug text-[var(--text-primary)]">Siwara POS</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">เข้าสู่ระบบพนักงาน</p>
        </div>

        <div className="space-y-4">
          <Input
            label="ID พนักงาน"
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
            เข้าสู่ระบบ
          </Button>
        </div>
      </form>
    </div>
  );
}
