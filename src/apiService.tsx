// filepath: /c:/projects/ZapVibes/tabs/src/apiService.tsx
import axios from 'axios';
import { AccountInfo } from '@azure/msal-browser';
import { msalInstance } from './services/msalInstance';
import { loginRequest } from './services/authConfig';

const API_URL = '/api';

const getAccount = (account?: AccountInfo | null): AccountInfo => {
  const resolved =
    account ||
    msalInstance.getActiveAccount() ||
    msalInstance.getAllAccounts()[0];
  if (!resolved) {
    throw new Error('No signed-in account');
  }
  return resolved;
};

/**
 * The signed-in user's Entra ID token. The server verifies it and reads the
 * `tid` claim to check the user's organisation is approved.
 */
export const getIdToken = async (
  account?: AccountInfo | null,
): Promise<string> => {
  const result = await msalInstance.acquireTokenSilent({
    ...loginRequest,
    account: getAccount(account),
  });
  return result.idToken;
};

export type TenantCheckResult = 'approved' | 'denied' | 'error';

// Upper bound on the whole check (token + request), so the gate never hangs.
const TENANT_CHECK_DEADLINE_MS = 10000;

/**
 * Asks the server whether the signed-in user's organisation is approved.
 * 'denied' is the server's verified answer (401/403). 'error' covers anything
 * transient (token, network, 5xx, deadline) and is also not an approval, but
 * callers may retry it.
 */
export const checkTenantAccess = async (
  account?: AccountInfo | null,
): Promise<TenantCheckResult> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<TenantCheckResult>(resolve => {
    timer = setTimeout(() => resolve('error'), TENANT_CHECK_DEADLINE_MS);
  });
  const check = (async (): Promise<TenantCheckResult> => {
    try {
      const idToken = await getIdToken(account);
      const response = await axios.get(`${API_URL}/tenant-access`, {
        headers: { Authorization: `Bearer ${idToken}` },
        timeout: TENANT_CHECK_DEADLINE_MS,
      });
      return response.data?.approved === true ? 'approved' : 'denied';
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : 0;
      return status === 401 || status === 403 ? 'denied' : 'error';
    }
  })();
  try {
    return await Promise.race([check, deadline]);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * The signed-in user's organisation name, from Microsoft Graph
 * (GET /organization works with the User.Read scope the app already has).
 */
export const getOrganisationName = async (
  account?: AccountInfo | null,
): Promise<string | null> => {
  try {
    const { accessToken } = await msalInstance.acquireTokenSilent({
      ...loginRequest,
      account: getAccount(account),
    });
    const response = await axios.get(
      'https://graph.microsoft.com/v1.0/organization?$select=displayName',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    return response.data?.value?.[0]?.displayName || null;
  } catch {
    return null;
  }
};

// Example: Get the authentication token (replace with actual logic)
const getAuthToken = () => {
  return 'your-secret-token'; // Replace with actual token retrieval logic
};

export const getRewardName = async () => {
  try {
    console.log('Fetching reward name');
    const response = await axios.get(`${API_URL}/reward-name`, {
      headers: {
        Authorization: getAuthToken(),
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching reward name:', error);
    throw error;
  }
};

export const updateRewardName = async (newRewardName: string) => {
  try {
    // Writes are limited to approved organisations, so send the ID token.
    const idToken = await getIdToken();
    const response = await axios.post(
      `${API_URL}/reward-name`,
      { newRewardName },
      {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      },
    );
    return response.data;
  } catch (error) {
    console.error('Error updating reward name:', error);
    throw error;
  }
};
