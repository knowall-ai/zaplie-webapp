import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './authConfig';

// The app-wide MSAL instance. Lives in its own module so services (e.g.
// apiService) can acquire tokens without importing index.tsx.
export const msalInstance = new PublicClientApplication(msalConfig);
