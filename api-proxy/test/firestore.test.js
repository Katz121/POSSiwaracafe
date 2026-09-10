/* global Buffer */
import { it, expect, vi } from 'vitest';
import { getFirebaseIdToken, createFirestore, encodeValue, fsValue } from '../src/firestore.js';
import { env, harness, memoryKV, NOW } from './helpers.js';
it('fails closed without credentials', async () => {
  const fetch = vi.fn();
  await expect(getFirebaseIdToken({}, { fetch })).rejects.toThrow('Firestore credentials not configured (FIREBASE_SERVICE_ACCOUNT or BOT_EMAIL/BOT_PASSWORD)');
  expect(fetch).not.toHaveBeenCalled();
});
it('staff login persists and rotates refresh tokens', async () => {
  const deps = harness();
  expect(await getFirebaseIdToken(env, deps)).toBe('id-token');
  expect(await deps.kv.get('__firebase_bot_refresh')).toBe('refresh');
  expect(await getFirebaseIdToken(env, deps)).toBe('id-token');
  expect(deps.calls.map(c => c.url)).toEqual([expect.stringContaining('signInWithPassword'), expect.stringContaining('securetoken')]);
});
it('revoked refresh falls back to staff login', async () => {
  const kv = memoryKV(); await kv.put('__firebase_bot_refresh', 'old');
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({}, { status: 400 })).mockResolvedValueOnce(Response.json({ idToken: 'new', refreshToken: 'new-refresh' }));
  expect(await getFirebaseIdToken(env, { kv, fetch })).toBe('new');
  expect(await kv.get('__firebase_bot_refresh')).toBe('new-refresh');
});
it('service account takes priority, signs verifiable RS256 JWT and caches until expiry minus 120', async () => {
  const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = await crypto.subtle.exportKey('pkcs8', keys.privateKey);
  const private_key = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString('base64')}\n-----END PRIVATE KEY-----`;
  const config = { ...env, FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ client_email: 'bot@example.invalid', private_key }) };
  const kv = memoryKV(), fetch = vi.fn(async () => Response.json({ access_token: 'access', expires_in: 3600 }));
  const deps = { kv, fetch, now: () => NOW };
  expect(await getFirebaseIdToken(config, deps)).toBe('access');
  const assertion = fetch.mock.calls[0][1].body.get('assertion');
  const [head, body, signature] = assertion.split('.');
  expect(JSON.parse(Buffer.from(head, 'base64url'))).toEqual({ alg: 'RS256', typ: 'JWT' });
  expect(JSON.parse(Buffer.from(body, 'base64url'))).toEqual({ iss: 'bot@example.invalid', scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: NOW / 1000, exp: NOW / 1000 + 3600 });
  expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', keys.publicKey, Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${head}.${body}`))).toBe(true);
  await getFirebaseIdToken(config, deps);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(kv.ttls.get('__gcp_access_token')).toBe(3480);
  await getFirebaseIdToken(config, { ...deps, now: () => NOW + 3480000 });
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('paginates all stock and decodes all value kinds', async () => {
  const original = { a: [1, 1.5, true, false, null, { text: '<test>' }] };
  expect(fsValue(encodeValue(original))).toEqual(original);
  const deps = harness();
  deps.fetch = vi.fn().mockResolvedValueOnce(Response.json({ idToken: 'id' })).mockResolvedValueOnce(Response.json({ documents: [{ name: 'stock/one', fields: { name: { stringValue: 'one' } } }], nextPageToken: 'a+b' })).mockResolvedValueOnce(Response.json({ documents: [{ name: 'stock/two', fields: {} }] }));
  expect(await createFirestore(env, deps).listAll('stock')).toEqual([{ id: 'one', name: 'one' }, { id: 'two' }]);
  expect(deps.fetch.mock.calls[2][0]).toContain('pageToken=a%2Bb');
});
it('retries transactions three times with fresh reads', async () => {
  const deps = harness(); deps.state.aborts = 3;
  const build = vi.fn(async tx => { await tx.getAll([]); return []; });
  await createFirestore(env, deps).runTransaction(build);
  expect(build).toHaveBeenCalledTimes(4);
  expect(deps.commits).toHaveLength(4);
});
it('stops after three retries and rolls back', async () => {
  const deps = harness(); deps.state.aborts = 5;
  await expect(createFirestore(env, deps).runTransaction(async () => [])).rejects.toMatchObject({ code: 'ABORTED' });
  expect(deps.commits).toHaveLength(4);
  expect(deps.calls.filter(c => c.url.endsWith(':rollback'))).toHaveLength(4);
});
