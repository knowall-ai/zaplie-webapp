import { AccountInfo } from '@azure/msal-browser';
import {
  KNOWALL_TENANT_ID,
  buildAccessRequestMailto,
  getAccountTenantId,
  isKnowAllTenant,
} from './tenantAccess';

const account = (claims?: Record<string, unknown>) =>
  ({ homeAccountId: 'x', idTokenClaims: claims }) as unknown as AccountInfo;

describe('getAccountTenantId', () => {
  test('reads and lower-cases the tid claim', () => {
    expect(
      getAccountTenantId(account({ tid: KNOWALL_TENANT_ID.toUpperCase() })),
    ).toBe(KNOWALL_TENANT_ID);
  });

  test('returns null for a missing or invalid tid (no default tenant)', () => {
    expect(getAccountTenantId(null)).toBeNull();
    expect(getAccountTenantId(account())).toBeNull();
    expect(getAccountTenantId(account({ tid: '' }))).toBeNull();
    expect(getAccountTenantId(account({ tid: 'organizations' }))).toBeNull();
  });

  test('only the KnowAll tenant is approved client-side', () => {
    expect(isKnowAllTenant(KNOWALL_TENANT_ID)).toBe(true);
    expect(isKnowAllTenant('99999999-8888-7777-6666-555555555555')).toBe(false);
    expect(isKnowAllTenant(null)).toBe(false);
  });
});

describe('buildAccessRequestMailto', () => {
  test('pre-fills subject and body for hello@knowall.ai', () => {
    const href = buildAccessRequestMailto({
      appName: 'Zaplie',
      organisationName: 'Contoso Ltd',
      tenantId: '99999999-8888-7777-6666-555555555555',
      email: 'ada@contoso.com',
    });
    const url = new URL(href);
    expect(url.protocol).toBe('mailto:');
    expect(url.pathname).toBe('hello@knowall.ai');
    expect(url.searchParams.get('subject')).toBe('Zaplie access request');
    const body = url.searchParams.get('body');
    expect(body).toContain('App: Zaplie');
    expect(body).toContain('Organisation: Contoso Ltd');
    expect(body).toContain('Tenant ID: 99999999-8888-7777-6666-555555555555');
    expect(body).toContain('Email: ada@contoso.com');
  });
});
