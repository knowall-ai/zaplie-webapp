import React from 'react';
import { useLocation } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import { useTenantAccess } from '../hooks/useTenantAccess';
import TenantNotApproved from './TenantNotApproved';

// The Teams sign-in popup pages must keep working so the popup can close.
const UNGATED_PATHS = ['/auth-start', '/auth-end'];

/**
 * Shows the "not set up yet" page instead of the app (no navigation, no data)
 * when the signed-in user's organisation isn't approved. Signed-out users fall
 * through to the normal sign-in flow, and per-route rules (RequireAuth) still
 * apply on top for approved users.
 */
const TenantGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { instance, accounts } = useMsal();
  const location = useLocation();
  const account = instance.getActiveAccount() || accounts[0] || null;
  const access = useTenantAccess(account);

  if (!account || UNGATED_PATHS.includes(location.pathname)) {
    return <>{children}</>;
  }
  if (access.status === 'checking') {
    return null;
  }
  if (access.status === 'not-approved') {
    return (
      <TenantNotApproved
        organisationName={access.organisationName}
        tenantId={access.tenantId}
        email={account.username || null}
      />
    );
  }
  return <>{children}</>;
};

export default TenantGate;
