import { describe, it, expect } from 'vitest';
import {
  isInventoryCategory,
  roundMoney,
  roundUnitCost,
  normalizeUnit,
  unitFactor,
  normalizeName,
  weightedAverageUnitCost,
  findAliasMatch,
  findStockCandidates,
  planStockIntake,
  applyIntakesSequentially,
  buildExpenseRecord
} from './stockIntake';

describe('stockIntake utils', () => {

  describe('roundMoney & roundUnitCost', () => {
    it('kills float noise for money', () => {
      expect(roundMoney(400.00000000004)).toBe(400);
      expect(roundMoney(12.345)).toBe(12.35);
      expect(roundMoney('invalid')).toBe(0);
      expect(roundMoney(Infinity)).toBe(0);
    });

    it('keeps 6 dp for unit cost', () => {
      expect(roundUnitCost(10/3)).toBe(3.333333);
      expect(roundUnitCost(1.0000000000001)).toBe(1);
    });
  });

  describe('normalizeUnit & unitFactor', () => {
    it('normalizes units correctly', () => {
      expect(normalizeUnit(' g ')).toBe('กรัม');
      expect(normalizeUnit('กก.')).toBe('กิโลกรัม');
      expect(normalizeUnit(' ml ')).toBe('มล.');
      expect(normalizeUnit('L')).toBe('ลิตร');
      expect(normalizeUnit('Pcs')).toBe('ชิ้น');
      expect(normalizeUnit('ขวด')).toBe('ขวด');
    });

    it('calculates factors for unit conversions', () => {
      expect(unitFactor('kg', 'g')).toBe(1000);
      expect(unitFactor('กรัม', 'กิโลกรัม')).toBe(0.001);
      expect(unitFactor('ลิตร', 'มล.')).toBe(1000);
      expect(unitFactor('มล.', 'l')).toBe(0.001);
      expect(unitFactor('pcs', 'ชิ้น')).toBe(1);
      expect(unitFactor('ขวด', 'มล.')).toBe(null); // No standard factor
    });
  });

  describe('normalizeName', () => {
    it('normalizes names', () => {
      expect(normalizeName(' นม  สด ')).toBe('นม สด');
      expect(normalizeName('Coffee Bean')).toBe('coffee bean');
    });
  });

  describe('weightedAverageUnitCost', () => {
    it('computes correctly for normal case', () => {
      const res = weightedAverageUnitCost({ onHandQty: 10, onHandUnitCost: 20, inQty: 10, inUnitCost: 30 });
      expect(res).toBe(25); // (200 + 300) / 20 = 25
    });

    it('ignores on-hand when qty <= 0 (e.g. negative stock)', () => {
      const res = weightedAverageUnitCost({ onHandQty: -5, onHandUnitCost: 20, inQty: 10, inUnitCost: 30 });
      expect(res).toBe(30); // Does not poison average
    });

    it('ignores on-hand when unit cost <= 0 or not finite', () => {
      const res = weightedAverageUnitCost({ onHandQty: 10, onHandUnitCost: 0, inQty: 10, inUnitCost: 30 });
      expect(res).toBe(30);
    });
  });

  describe('findAliasMatch', () => {
    const stockItems = [
      { id: '1', purchaseAliases: [{ barcode: '12345', title: 'นมขวด', unit: 'ขวด', toBase: 500 }] },
      { id: '2', purchaseAliases: [{ barcode: '67890', title: 'น้ำตาล', unit: 'kg' }] }
    ];

    it('matches exact barcode over title', () => {
      const res = findAliasMatch(stockItems, { barcode: '12345', title: 'อื่นๆ' });
      expect(res.alias.barcode).toBe('12345');
      expect(res.stock.id).toBe('1');
    });

    it('matches normalized title', () => {
      const res = findAliasMatch(stockItems, { barcode: '', title: ' นมขวด ' });
      expect(res.alias.title).toBe('นมขวด');
      expect(res.stock.id).toBe('1');
    });

    it('returns null if not found', () => {
      const res = findAliasMatch(stockItems, { barcode: '999', title: 'กาแฟ' });
      expect(res).toBeNull();
    });
  });

  describe('findStockCandidates', () => {
    const stockItems = [
      { id: '1', name: 'นมวัวสด' },
      { id: '2', name: 'นมเมจิ 2L' },
      { id: '3', name: 'น้ำตาลทราย' },
      { id: '4', name: 'นม' } // exact match target
    ];

    it('returns exact match exclusively if found', () => {
      const res = findStockCandidates(stockItems, ' นม ');
      expect(res.length).toBe(1);
      expect(res[0].id).toBe('4');
    });

    it('returns highest scored candidates', () => {
      const res = findStockCandidates(stockItems, ' นม สด');
      expect(res.length).toBeGreaterThan(0);
      expect(res[0].name).toBe('นม'); // 'นม สด' includes 'นม', and tokens match
    });
  });

  describe('planStockIntake', () => {
    const stock = { id: 's1', quantity: 10, unit: 'กรัม', unitCost: 1 };

    it('plans correctly with implicit unit factor (kg to กรัม)', () => {
      const res = planStockIntake({ quantity: 1, unit: 'kg', amount: 1500 }, stock);
      expect(res.ok).toBe(true);
      expect(res.inQty).toBe(1000);
      expect(res.inUnitCost).toBe(1.5);
      expect(res.newQuantity).toBe(1010);
      // Average: (10 * 1 + 1000 * 1.5) / 1010 = 1510 / 1010 = 1.49505
      expect(res.newUnitCost).toBe(1.49505);
    });

    it('plans correctly using alias toBase (ขวด to กรัม)', () => {
      const alias = { toBase: 500 };
      const res = planStockIntake({ quantity: 2, unit: 'ขวด', amount: 1000 }, stock, alias);
      expect(res.ok).toBe(true);
      expect(res.inQty).toBe(1000); // 2 * 500
      expect(res.inUnitCost).toBe(1); // 1000 / 1000
    });

    it('fails with unit mismatch if no factor and no alias', () => {
      const res = planStockIntake({ quantity: 1, unit: 'ขวด', amount: 1000 }, stock);
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('unit-mismatch');
    });
  });

  describe('applyIntakesSequentially', () => {
    it('folds multiple lines hitting the same stock', () => {
      const stock = { id: 's1', quantity: 0, unit: 'ชิ้น', unitCost: 0 };
      const lines = [
        { quantity: 10, unit: 'ชิ้น', amount: 100 }, // 10 pieces @ 10 each
        { quantity: 10, unit: 'ชิ้น', amount: 200 }  // 10 pieces @ 20 each
      ];

      const res = applyIntakesSequentially(stock, lines);
      expect(res.plans.length).toBe(2);
      expect(res.final.quantity).toBe(20);
      expect(res.final.unitCost).toBe(15); // (100 + 200) / 20 = 15
    });
  });

  describe('buildExpenseRecord', () => {
    it('builds record with plain line', () => {
      const line = { title: 'ค่าไฟ', quantity: 1, unit: 'ครั้ง', amount: 400.00000000004, category: 'ค่าไฟ' };
      const rec = buildExpenseRecord(line, { date: '2026-09-10', extra: { source: 'telegram' } });
      expect(rec.title).toBe('ค่าไฟ');
      expect(rec.amount).toBe(400); // float noise fixed
      expect(rec.pricePerUnit).toBe(400);
      expect(rec.source).toBe('telegram');
      expect(rec.stockId).toBeUndefined(); // no plan
    });

    it('builds record with stock plan', () => {
      const line = { title: 'นม', quantity: 1, unit: 'kg', amount: 100, category: 'วัตถุดิบ' };
      const plan = { ok: true, stockId: 's1', inQty: 1000, stockUnit: 'กรัม' };
      const rec = buildExpenseRecord(line, { date: '2026-09-10', plan });
      expect(rec.stockId).toBe('s1');
      expect(rec.stockQuantity).toBe(1000);
      expect(rec.stockUnit).toBe('กรัม');
    });

    it('refuses a missing category instead of silently falling into a stock category', () => {
      const line = { title: 'ค่าไฟ', quantity: 1, unit: 'ครั้ง', amount: 100, category: null };
      expect(() => buildExpenseRecord(line, { date: '2026-09-10' })).toThrow(/category/);
    });
  });

});
