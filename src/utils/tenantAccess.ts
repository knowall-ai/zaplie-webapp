import { AccountInfo } from '@azure/msal-browser';

// Only organisations KnowAll has approved can use Zaplie. The KnowAll tenant
// (which B2B guests invited into KnowAll also sign in through) is always
// approved; other tenants are approved on the server via APPROVED_TENANT_IDS.
export const KNOWALL_TENANT_ID = 'f36f6414-cb7d-4545-9cf2-7574f7b5c584';

export const ACCESS_REQUEST_EMAIL = 'hello@knowall.ai';

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Lower-cases and validates a tenant id. Returns null when it isn't a GUID. */
export const normaliseTenantId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const tenantId = value.trim().toLowerCase();
  return GUID_PATTERN.test(tenantId) ? tenantId : null;
};

/**
 * The signed-in user's tenant, read from the `tid` claim of their ID token.
 * Never falls back to a default tenant: no valid `tid` means no tenant.
 */
export const getAccountTenantId = (
  account: AccountInfo | null | undefined,
): string | null => normaliseTenantId(account?.idTokenClaims?.tid);

export const isKnowAllTenant = (tenantId: string | null): boolean =>
  tenantId === KNOWALL_TENANT_ID;

/** A mailto: link that asks KnowAll to approve the user's organisation. */
export const buildAccessRequestMailto = ({
  appName,
  organisationName,
  tenantId,
  email,
}: {
  appName: string;
  organisationName: string | null;
  tenantId: string | null;
  email: string | null;
}): string => {
  const subject = `${appName} access request`;
  const body = [
    'Hello KnowAll,',
    '',
    `Please could you set up our organisation on ${appName}?`,
    '',
    `App: ${appName}`,
    `Organisation: ${organisationName || 'Unknown'}`,
    `Tenant ID: ${tenantId || 'Unknown'}`,
    `Email: ${email || 'Unknown'}`,
    '',
    'Thank you',
  ].join('\r\n');
  return `mailto:${ACCESS_REQUEST_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
};
