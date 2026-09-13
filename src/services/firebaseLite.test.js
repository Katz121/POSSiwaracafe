import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  app: {}, db: {}, ensureSignedIn: vi.fn(), getDoc: vi.fn(), getDocs: vi.fn(),
}));
vi.mock('./firebase', () => ({ auth: { app: mocks.app } }));
vi.mock('./memberLookup', () => ({ ensureSignedIn: mocks.ensureSignedIn }));
vi.mock('firebase/firestore/lite', () => ({
  getFirestore: (app) => { expect(app).toBe(mocks.app); return mocks.db; },
  doc: (db, ...path) => ({ db, path }),
  collection: (db, ...path) => ({ db, path }),
  getDoc: mocks.getDoc, getDocs: mocks.getDocs,
}));

import { liteDb, menuLiteReader, fetchMenuCollectionsLite } from './firebaseLite';
import { fetchPublicMenu } from '../utils/publicMenu';

beforeEach(() => vi.resetAllMocks());

it('waits for auth before reading the public bundle with Lite', async () => {
  let ready;
  mocks.ensureSignedIn.mockReturnValue(new Promise(resolve => { ready = resolve; }));
  const bundle = { menu: [{ id: 'coffee' }] };
  mocks.getDoc.mockResolvedValue({ exists: () => true, data: () => bundle });
  const pending = fetchPublicMenu(liteDb, 'test', menuLiteReader);
  expect(mocks.getDoc).not.toHaveBeenCalled();
  ready();
  expect(await pending).toBe(bundle);
  expect(mocks.getDoc).toHaveBeenCalledWith({ db: mocks.db, path: ['artifacts', 'test', 'public', 'data', 'config', 'publicMenu'] });
});

it('reads all three fallback collections with Lite after auth', async () => {
  mocks.getDocs.mockResolvedValue({ empty: true, docs: [] });
  const snapshots = await fetchMenuCollectionsLite('test');
  expect(snapshots).toHaveLength(3);
  expect(mocks.ensureSignedIn).toHaveBeenCalledOnce();
  expect(mocks.getDocs.mock.calls.map(([ref]) => ref.path.at(-1))).toEqual(['menu', 'categories', 'beanModifiers']);
  expect(mocks.getDocs.mock.calls.every(([ref]) => ref.db === mocks.db)).toBe(true);
});

it('does not issue reads when authentication fails', async () => {
  mocks.ensureSignedIn.mockRejectedValue(new Error('auth failed'));
  await expect(fetchMenuCollectionsLite('test')).rejects.toThrow('auth failed');
  expect(mocks.getDocs).not.toHaveBeenCalled();
});

it('returns null for an unpublished bundle and propagates permission errors', async () => {
  mocks.getDoc.mockResolvedValue({ exists: () => false });
  expect(await fetchPublicMenu(liteDb, 'test', menuLiteReader)).toBeNull();
  mocks.getDoc.mockRejectedValue(new Error('permission-denied'));
  await expect(fetchPublicMenu(liteDb, 'test', menuLiteReader)).rejects.toThrow('permission-denied');
});
