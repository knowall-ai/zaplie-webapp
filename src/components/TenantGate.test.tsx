import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';
import TenantGate from './TenantGate';
import RequireAuth from './RequireAuth';
import { checkTenantAccess, getOrganisationName } from '../apiService';
import { KNOWALL_TENANT_ID } from '../utils/tenantAccess';
import { TENANT_CHECK_RETRY_DELAY_MS } from '../hooks/useTenantAccess';

jest.mock('@azure/msal-react', () => ({ useMsal: jest.fn() }));
jest.mock('../apiService', () => ({
  checkTenantAccess: jest.fn(),
  getOrganisationName: jest.fn(),
}));
jest.mock('../hooks/useTeamsAuth', () => ({
  useTeamsAuth: () => ({
    handleLogout: (...args: unknown[]) => mockLogout(...args),
    isLoggingOut: false,
  }),
}));
jest.mock('../services/authConfig', () => ({ loginRequest: { scopes: [] } }));

const mockLogout = jest.fn();
const mockUseMsal = useMsal as jest.Mock;
const mockCheck = checkTenantAccess as jest.Mock;
const mockOrgName = getOrganisationName as jest.Mock;

const CUSTOMER_TENANT = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const UNAPPROVED_TENANT = '99999999-8888-7777-6666-555555555555';

const signInAs = (claims: Record<string, unknown> | null) => {
  const accounts = claims
    ? [
        {
          homeAccountId: 'user-1',
          username: 'ada@contoso.com',
          idTokenClaims: claims,
        },
      ]
    : [];
  mockUseMsal.mockReturnValue({
    accounts,
    inProgress: 'none',
    instance: {
      getActiveAccount: () => accounts[0] || null,
      acquireTokenSilent: jest.fn().mockRejectedValue(new Error('no account')),
    },
  });
};

// Minimal render helpers (the repo has jest-dom but not @testing-library/react).
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;

const text = () => container.textContent || '';
const flush = () =>
  act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
const link = (name: string) =>
  Array.from(container.querySelectorAll('a')).find(
    a => a.textContent === name,
  ) as HTMLAnchorElement;

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const renderApp = async (path = '/feed') => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // This is react-dom's root.render, not Testing Library's render, so act is needed.
  // eslint-disable-next-line testing-library/no-unnecessary-act
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <TenantGate>
          <Routes>
            <Route
              path="/feed"
              element={
                <RequireAuth>
                  <div>Zap feed data</div>
                </RequireAuth>
              }
            />
            <Route path="/login" element={<div>Sign in page</div>} />
            <Route path="/auth-end" element={<div>Completing sign in</div>} />
          </Routes>
        </TenantGate>
      </MemoryRouter>,
    ),
  );
  await flush();
  await flush();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOrgName.mockResolvedValue('Contoso Ltd');
});

test('a KnowAll user (or B2B guest in KnowAll) sees the app without a server round trip', async () => {
  signInAs({ tid: KNOWALL_TENANT_ID });
  await renderApp();
  expect(text()).toContain('Zap feed data');
  expect(mockCheck).not.toHaveBeenCalled();
});

test('a user from a server-approved tenant sees the app', async () => {
  mockCheck.mockResolvedValue('approved');
  signInAs({ tid: CUSTOMER_TENANT });
  await renderApp();
  expect(text()).toContain('Zap feed data');
  expect(text()).not.toContain("isn't set up on Zaplie");
});

test('an unapproved tenant gets the not-yet-approved page and no app data', async () => {
  mockCheck.mockResolvedValue('denied');
  signInAs({ tid: UNAPPROVED_TENANT });
  await renderApp();

  expect(container.querySelector('h1')).toHaveTextContent(
    "Your organisation isn't set up on Zaplie yet.",
  );
  expect(text()).not.toContain('Zap feed data');
  expect(text()).toContain('Contoso Ltd');
  expect(text()).toContain(UNAPPROVED_TENANT);

  const url = new URL(link('Request access').href);
  expect(url.pathname).toBe('hello@knowall.ai');
  expect(url.searchParams.get('subject')).toBe('Zaplie access request');
  expect(url.searchParams.get('body')).toContain('Organisation: Contoso Ltd');
  expect(url.searchParams.get('body')).toContain('Email: ada@contoso.com');

  expect(link('hello@knowall.ai')).toHaveAttribute(
    'href',
    'mailto:hello@knowall.ai',
  );
  const signOut = container.querySelector('button') as HTMLButtonElement;
  expect(signOut).toHaveTextContent('Sign out');
  act(() => signOut.click());
  // Signs out the account shown on the page, not just accounts[0].
  expect(mockLogout).toHaveBeenCalledWith(
    expect.objectContaining({ homeAccountId: 'user-1' }),
  );
});

test('a missing tid is blocked without asking the server', async () => {
  signInAs({ oid: 'no-tenant' });
  await renderApp();
  expect(text()).toContain("isn't set up on Zaplie yet");
  expect(text()).not.toContain('Zap feed data');
  expect(mockCheck).not.toHaveBeenCalled();
});

test('a server error is retried once, then fails closed', async () => {
  mockCheck.mockResolvedValue('error');
  mockOrgName.mockResolvedValue(null);
  signInAs({ tid: CUSTOMER_TENANT });
  await renderApp();
  await act(() => new Promise(r => setTimeout(r, TENANT_CHECK_RETRY_DELAY_MS)));
  await flush();
  expect(mockCheck).toHaveBeenCalledTimes(2);
  expect(text()).toContain("isn't set up on Zaplie yet");
  expect(text()).not.toContain('Zap feed data');
});

test('a transient error that clears on retry lets an approved user in', async () => {
  mockCheck.mockResolvedValueOnce('error').mockResolvedValueOnce('approved');
  signInAs({ tid: CUSTOMER_TENANT });
  await renderApp();
  await act(() => new Promise(r => setTimeout(r, TENANT_CHECK_RETRY_DELAY_MS)));
  await flush();
  expect(text()).toContain('Zap feed data');
});

test('existing rules still apply: signed-out users are sent to sign in', async () => {
  signInAs(null);
  await renderApp();
  expect(text()).toContain('Sign in page');
  expect(text()).not.toContain('Zap feed data');
});

test('the Teams sign-in popup pages are never gated', async () => {
  signInAs({ tid: UNAPPROVED_TENANT });
  await renderApp('/auth-end');
  expect(text()).toContain('Completing sign in');
});
