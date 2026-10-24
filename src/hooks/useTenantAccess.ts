import { useEffect, useState } from 'react';
import { AccountInfo } from '@azure/msal-browser';
import { checkTenantAccess, getOrganisationName } from '../apiService';
import { getAccountTenantId, isKnowAllTenant } from '../utils/tenantAccess';

export const TENANT_CHECK_RETRY_DELAY_MS = 1500;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export type TenantAccessStatus = 'checking' | 'approved' | 'not-approved';

export interface TenantAccess {
  status: TenantAccessStatus;
  tenantId: string | null;
  organisationName: string | null;
}

/**
 * Is the signed-in user's organisation approved to use Zaplie?
 * - No valid `tid` claim: not approved (never assumes a default tenant).
 * - The KnowAll tenant (incl. B2B guests): approved straight away.
 * - Any other tenant: the server decides (GET /api/tenant-access), and
 *   anything short of an explicit approval is treated as not approved. A
 *   transient error (network, 5xx, timeout) is retried once first.
 */
export const useTenantAccess = (account: AccountInfo | null): TenantAccess => {
  const tenantId = getAccountTenantId(account);
  const accountKey = account?.homeAccountId ?? null;

  const initialStatus = (): TenantAccessStatus => {
    if (!account) return 'checking';
    if (!tenantId) return 'not-approved';
    return isKnowAllTenant(tenantId) ? 'approved' : 'checking';
  };

  const [status, setStatus] = useState<TenantAccessStatus>(initialStatus);
  const [organisationName, setOrganisationName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const next = initialStatus();
    setStatus(next);
    setOrganisationName(null);
    if (!account || next === 'approved') return;

    (async () => {
      let result =
        next === 'checking' ? await checkTenantAccess(account) : null;
      if (result === 'error' && !cancelled) {
        await wait(TENANT_CHECK_RETRY_DELAY_MS);
        if (!cancelled) result = await checkTenantAccess(account);
      }
      if (cancelled) return;
      if (result === 'approved') {
        setStatus('approved');
        return;
      }
      setStatus('not-approved');
      const name = await getOrganisationName(account);
      if (!cancelled) setOrganisationName(name);
    })();

    return () => {
      cancelled = true;
    };
    // Re-check only when the signed-in account or its tenant changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountKey, tenantId]);

  return { status, tenantId, organisationName };
};

export default useTenantAccess;
