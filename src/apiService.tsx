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

/**
 * Asks the server whether the signed-in user's organisation is approved.
 * Anything other than an explicit approval (403, 401, 503, network error)
 * counts as not approved.
 */
export const checkTenantAccess = async (
  account?: AccountInfo | null,
): Promise<boolean> => {
  try {
    const idToken = await getIdToken(account);
    const response = await axios.get(`${API_URL}/tenant-access`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    return response.data?.approved === true;
  } catch {
    return false;
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
