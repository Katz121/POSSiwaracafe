import { it, expect, describe } from 'vitest';
import { matchAutoReply } from '../worker.js';

// กฎ auto-reply ของ LINE OA · ลำดับกฎมีผล (ตัวแรกที่ตรงคือตัวที่ตอบ)
// เทสนี้ล็อกพฤติกรรมที่พังง่ายเวลามีคนไปสลับลำดับหรือเพิ่มคีย์เวิร์ดทับกัน
describe('auto-reply ของ LINE OA', () => {
  it('ตอบเวลาเปิดปิดพร้อมลิงก์แผนที่', () => {
    for (const q of ['ร้านเปิดกี่โมงคะ', 'วันนี้เปิดไหม', 'ปิดวันไหน']) {
      expect(matchAutoReply(q)).toContain('เปิดอังคาร');
    }
  });

  // เคสที่พังมาก่อน: ข้อความเดียวมีทั้ง "เบรก" และ "เค้ก" ต้องไปทางจัดเบรก
  // เพราะเป็นลูกค้าหน่วยงาน คนละกลุ่มกับคนสั่งเค้กวันเกิด
  it('ข้อความที่มีทั้งเบรกและเค้ก ต้องตอบเรื่องจัดเบรก', () => {
    expect(matchAutoReply('ขอใบเสนอราคาจัดเบรกพร้อมเค้กด้วยค่ะ')).toContain('Snack Box');
    expect(matchAutoReply('อยากจัดเบรกให้หน่วยงาน 50 ชุด')).toContain('เบิกได้');
  });

  it('ตอบเรื่องเค้กพร้อมช่วงราคาจริง', () => {
    for (const q of ['อยากสั่งเค้กวันเกิด 1 ปอนด์', 'ทำเค้ก birthday ได้ไหม']) {
      const a = matchAutoReply(q);
      expect(a).toContain('290');
      expect(a).toContain('790');
    }
  });

  it('ตอบเรื่องเมนูกาแฟด้วยราคาเริ่มต้นจริง', () => {
    expect(matchAutoReply('กาแฟราคาเท่าไหร่')).toContain('50 บาท');
    expect(matchAutoReply('มีมัทฉะไหมคะ')).toContain('มัทฉะ');
  });

  it('ตอบแต้ม ที่จอดรถ สั่งล่วงหน้า ที่อยู่ และบอร์ดเกม', () => {
    expect(matchAutoReply('สะสมแต้มยังไง')).toContain('เบอร์โทร');
    expect(matchAutoReply('มีที่จอดรถไหม')).toContain('ลานจอดรถ');
    expect(matchAutoReply('สั่งล่วงหน้าได้ไหม')).toContain('สั่งล่วงหน้า');
    expect(matchAutoReply('ร้านอยู่ที่ไหน')).toContain('53 ถนนราษฎร์บำรุง');
    expect(matchAutoReply('มีบอร์ดเกมไหม')).toContain('บอร์ดเกม');
  });

  // ข้อความทั่วไปต้องเงียบ ปล่อยให้เจ้าของตอบเอง · บอทตอบทุกข้อความ = ลูกค้าหนี
  it('ข้อความที่ไม่ตรงกฎไหนต้องไม่ตอบ', () => {
    for (const q of ['สวัสดีครับ', 'ขอบคุณค่ะ', 'โอเคครับ']) {
      expect(matchAutoReply(q)).toBeNull();
    }
  });
});
