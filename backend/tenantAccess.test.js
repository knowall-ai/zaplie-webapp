// Run with `npm run test:server` (Node's built-in test runner).
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SignJWT, generateKeyPair } = require('jose');
const {
  KNOWALL_TENANT_ID,
  parseApprovedTenantIds,
  isTenantApproved,
  createTenantGate,
} = require('./tenantAccess');
const { createApp } = require('./app');

// Await close (and drop keep-alive sockets) so the test process exits promptly.
const closeServer = server =>
  new Promise(resolve => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  });

const CLIENT_ID = '11111111-2222-3333-4444-555555555555';
const APPROVED_CUSTOMER = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const UNAPPROVED = '99999999-8888-7777-6666-555555555555';

describe('parseApprovedTenantIds / isTenantApproved', () => {
  test('always includes the KnowAll tenant', () => {
    const approved = parseApprovedTenantIds(undefined);
    assert.ok(isTenantApproved(KNOWALL_TENANT_ID, approved));
    assert.equal(approved.size, 1);
  });

  test('accepts listed GUIDs, case-insensitively, ignoring junk', () => {
    const approved = parseApprovedTenantIds(
      ` ${APPROVED_CUSTOMER.toUpperCase()} , not-a-guid,,`,
    );
    assert.ok(isTenantApproved(APPROVED_CUSTOMER, approved));
    assert.ok(isTenantApproved(APPROVED_CUSTOMER.toUpperCase(), approved));
    assert.equal(approved.size, 2);
  });

  test('rejects unlisted, missing and malformed tenant ids', () => {
    const approved = parseApprovedTenantIds(APPROVED_CUSTOMER);
    assert.equal(isTenantApproved(UNAPPROVED, approved), false);
    assert.equal(isTenantApproved(undefined, approved), false);
    assert.equal(isTenantApproved('', approved), false);
    assert.equal(isTenantApproved('common', approved), false);
  });
});

describe('API routes behind the tenant gate', () => {
  let server;
  let baseUrl;
  let privateKey;
  let otherPrivateKey;
  let dataFilePath;

  const idToken = async (claims, { key = privateKey, tid } = {}) => {
    const issuerTenant = tid || claims.tid || KNOWALL_TENANT_ID;
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(`https://login.microsoftonline.com/${issuerTenant}/v2.0`)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(key);
  };

  const call = (route, { token, method = 'GET', body } = {}) =>
    fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  before(async () => {
    const keys = await generateKeyPair('RS256');
    privateKey = keys.privateKey;
    otherPrivateKey = (await generateKeyPair('RS256')).privateKey;
    dataFilePath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'zaplie-')),
      'data.json',
    );
    fs.writeFileSync(dataFilePath, JSON.stringify({ rewardName: 'sats' }));

    const tenantGate = createTenantGate({
      clientId: CLIENT_ID,
      approvedTenantIds: parseApprovedTenantIds(APPROVED_CUSTOMER),
      keySet: keys.publicKey,
    });
    server = createApp({ tenantGate, dataFilePath }).listen(0);
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => closeServer(server));

  test('a KnowAll user (including B2B guests, whose tid is KnowAll) passes', async () => {
    const token = await idToken({ tid: KNOWALL_TENANT_ID, oid: 'guest' });
    const res = await call('/api/tenant-access', { token });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      approved: true,
      tenantId: KNOWALL_TENANT_ID,
    });
  });

  test('a user from a tenant in APPROVED_TENANT_IDS passes', async () => {
    const token = await idToken({ tid: APPROVED_CUSTOMER });
    const res = await call('/api/tenant-access', { token });
    assert.equal(res.status, 200);
  });

  test('an unapproved tenant gets 403 and no data', async () => {
    const token = await idToken({ tid: UNAPPROVED });
    const access = await call('/api/tenant-access', { token });
    assert.equal(access.status, 403);
    assert.deepEqual(await access.json(), {
      code: 'tenant_not_approved',
      message: "Your organisation isn't set up on Zaplie yet",
      tenantId: UNAPPROVED,
    });

    const write = await call('/api/reward-name', {
      token,
      method: 'POST',
      body: { newRewardName: 'hacked' },
    });
    assert.equal(write.status, 403);
    assert.equal(
      JSON.parse(fs.readFileSync(dataFilePath, 'utf8')).rewardName,
      'sats',
    );
  });

  test('a token without a tid is blocked', async () => {
    const token = await idToken({ oid: 'someone' });
    const res = await call('/api/tenant-access', { token });
    assert.equal(res.status, 403);
  });

  test('missing, forged or wrong-issuer tokens get 401', async () => {
    assert.equal((await call('/api/tenant-access')).status, 401);

    const forged = await idToken(
      { tid: KNOWALL_TENANT_ID },
      { key: otherPrivateKey },
    );
    assert.equal(
      (await call('/api/tenant-access', { token: forged })).status,
      401,
    );

    // Claims the KnowAll tid but was issued by another tenant.
    const spoofed = await idToken(
      { tid: KNOWALL_TENANT_ID },
      { tid: UNAPPROVED },
    );
    assert.equal(
      (await call('/api/tenant-access', { token: spoofed })).status,
      401,
    );
  });

  test('an approved user can still update the reward name', async () => {
    const token = await idToken({ tid: APPROVED_CUSTOMER });
    const res = await call('/api/reward-name', {
      token,
      method: 'POST',
      body: { newRewardName: 'kudos' },
    });
    assert.equal(res.status, 200);
    assert.equal(
      JSON.parse(fs.readFileSync(dataFilePath, 'utf8')).rewardName,
      'kudos',
    );
  });

  test('existing rules still apply: reward-name GET keeps its auth header check', async () => {
    assert.equal((await call('/api/reward-name')).status, 401);
    const res = await fetch(`${baseUrl}/api/reward-name`, {
      headers: { Authorization: 'your-secret-token' },
    });
    assert.equal(res.status, 200);
  });

  test('the gate fails closed when no AAD client id is configured', async () => {
    const gate = createTenantGate({ clientId: '' });
    const app = createApp({ tenantGate: gate, dataFilePath }).listen(0);
    try {
      const token = await idToken({ tid: KNOWALL_TENANT_ID });
      const res = await fetch(
        `http://127.0.0.1:${app.address().port}/api/tenant-access`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      assert.equal(res.status, 503);
    } finally {
      await closeServer(app);
    }
  });
});
