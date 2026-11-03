# Getting Started with Zaplie React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Proxy

To resolve the CORS blocking issue, we setup a proxy. This is done by `setupProxy.js` which is dependent on running:

```
npm install http-proxy-middleware@2.0.6
```

NB We install version `2.0.6` because that is the version used by `webpack-dev-server` (a dependency of `react-scripts`). You can check you only have one version of `http-proxy-middle@2.0.6` is installed by running:

```
npm ls http-proxy-middleware
```

## SSO Authentication

For the SSO authentication function to work, obtain the MS Bot Framework ID saved in the Environment variables.
1. Update the enviroment variables with the Bot CLient ID and with your Tenant ID
2. Navigate to https:portal.azure.com and search for App Registration
3. Search for the Bot App regristation using the client ID used in your environment variables.
4. Under Manage, select Authentication.
5. Under Platform configurations , click **Add a platform**
6. Select Single-page application
in the URL Redirect add http://localhost:{portnumber} in this instance it was 3000
7. Under Advance setting on the same page, **Allow public client flows**
8. Now save the changes


## Approved organisations

Like the Purple Team Portal, only organisations KnowAll has approved can use Zaplie. After sign-in, a user is let in only when the `tid` (tenant ID) claim on their Entra ID token is:

- the KnowAll tenant `f36f6414-cb7d-4545-9cf2-7574f7b5c584` (this includes B2B guests invited into the KnowAll tenant, who sign in through it), or
- listed in the `APPROVED_TENANT_IDS` app setting.

A missing or invalid `tid` is never allowed. Everyone else sees a "Your organisation isn't set up on Zaplie yet" page with a **Request access** email to hello@knowall.ai, and no app data or navigation.

The check runs on the Node server (`backend/tenantAccess.js`): `GET /api/tenant-access` verifies the user's ID token and answers 200 (approved), 401 (no/invalid token) or 403 (organisation not approved). `POST /api/reward-name` is behind the same gate. The React app asks the server before showing anything to a non-KnowAll user, and treats any error as "not approved".

**To approve an organisation**, add its tenant GUID to the `APPROVED_TENANT_IDS` application setting on the App Service (comma-separated, case doesn't matter), then restart the app:

```
APPROVED_TENANT_IDS=11111111-2222-3333-4444-555555555555,66666666-7777-8888-9999-000000000000
```

The tenant ID is shown on the "not set up yet" page and in the access-request email. The server also needs `AAD_CLIENT_ID` (the app registration's client ID, the same value as `REACT_APP_AAD_CLIENT_ID`) so it can verify ID tokens. See `backend/.env.example`. For local development, pass them to `npm start`, e.g. `AAD_CLIENT_ID=... APPROVED_TENANT_IDS=... npm start`.

## Available Scripts

In the project directory, you can run:

```
npm install
npm start
```

This runs the app in the development mode and will create necessary symbolic links (to lnbitsService.ts)

Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.

You may also see any lint errors in the console.

### Linting

Run ESLint to check for code quality issues:

```
npm run lint
```

To automatically fix linting issues:

```
npm run lint:fix
```

### Formatting

Check if code is properly formatted with Prettier:

```
npm run format:check
```

To automatically format all files:

```
npm run format
```

### Testing

To run the app in the interactive watch mode, run:

`npm test`

See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

To run the server (API) tests, including the approved-organisation gate:

`npm run test:server`

### Deploying

Run the following command:

`npm run build`

This builds the app for production to the `build` folder. It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes. Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

The deploy workflows (`.github/workflows/Azure_App_Service_zaplie-*.yml`) build from the repo root and stage a `deploy/` package with `scripts/stage-deploy.js`: `build/`, `backend/`, `web.config` (iisnode runs `backend/server.js`) and only the server's runtime packages, including `jose`.

**Before deploying**, both of these application settings must exist on the App Service (and each deployment slot):

| Setting | Value |
| --- | --- |
| `AAD_CLIENT_ID` | The app registration's client ID (the same value as `REACT_APP_AAD_CLIENT_ID`). The server verifies ID tokens against it. |
| `APPROVED_TENANT_IDS` | Comma-separated tenant GUIDs of the approved organisations (KnowAll's own tenant is always approved). |

Without `AAD_CLIENT_ID` (the server also accepts a `REACT_APP_AAD_CLIENT_ID` app setting) the tenant gate can't verify anyone, so `GET /api/tenant-access` and `POST /api/reward-name` return 503. Without `APPROVED_TENANT_IDS`, only KnowAll's tenant can sign in.

## CI/CD

This project uses GitHub Actions for continuous integration. On every push and pull request to `main`, the following checks are automatically run:

| Check | Description |
|-------|-------------|
| **Lint** | ESLint checks for code quality issues |
| **Format** | Prettier formatting verification |
| **TypeScript** | Type checking with `tsc --noEmit` |
| **Build** | Verifies the application builds successfully |

All checks must pass before merging pull requests.
