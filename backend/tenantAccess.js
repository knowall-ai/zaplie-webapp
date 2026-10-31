// Approved-organisation (Entra tenant) gate for the Zaplie API.
//
// Only organisations KnowAll has approved may use Zaplie. A signed-in user is
// allowed when the `tid` claim of their verified Entra ID token is the KnowAll
// tenant, or is listed in the APPROVED_TENANT_IDS app setting
// (comma-separated tenant GUIDs). A missing or malformed `tid` is never
// allowed, and there is no fallback to a default tenant.
const { createRemoteJWKSet, jwtVerify } = require('jose');

const KNOWALL_TENANT_ID = 'f36f6414-cb7d-4545-9cf2-7574f7b5c584';

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Entra publishes the signing keys for every tenant at this endpoint.
const ENTRA_JWKS_URL =
  'https://login.microsoftonline.com/common/discovery/v2.0/keys';

/** Lower-cases and validates a tenant id. Returns null when it isn't a GUID. */
const normaliseTenantId = value => {
  if (typeof value !== 'string') return null;
  const tenantId = value.trim().toLowerCase();
  return GUID_PATTERN.test(tenantId) ? tenantId : null;
};

/** The KnowAll tenant plus every valid GUID in APPROVED_TENANT_IDS. */
const parseApprovedTenantIds = raw => {
  const approved = new Set([KNOWALL_TENANT_ID]);
  (raw || '').split(',').forEach(entry => {
    const tenantId = normaliseTenantId(entry);
    if (tenantId) approved.add(tenantId);
  });
  return approved;
};

const isTenantApproved = (tid, approvedTenantIds) => {
  const tenantId = normaliseTenantId(tid);
  return tenantId !== null && approvedTenantIds.has(tenantId);
};

// Errors from the key set that mean the token itself is wrong (no key for its
// `kid`, an ambiguous `kid`, a bad header or algorithm), so stay 401.
const TOKEN_KEY_ERRORS = new Set([
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
  'ERR_JWS_INVALID',
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JOSE_NOT_SUPPORTED',
]);

/** Thrown when Entra's signing keys can't be fetched, so the token can't be checked. */
class KeySetUnavailableError extends Error {
  constructor(cause) {
    super('Entra signing keys are unavailable', { cause });
    this.name = 'KeySetUnavailableError';
  }
}

/**
 * Wraps a remote key set so a failure to fetch the keys (jose's JWKSTimeout,
 * a non-200 or invalid JWKS response, a network error) is told apart from a
 * token that fails verification. A key object or local key set is returned as is.
 */
const guardKeySet = keySet => {
  if (typeof keySet !== 'function') return keySet;
  return async (...args) => {
    try {
      return await keySet(...args);
    } catch (error) {
      if (TOKEN_KEY_ERRORS.has(error?.code)) throw error;
      throw new KeySetUnavailableError(error);
    }
  };
};

/**
 * Verifies an Entra ID v2.0 ID token: signature, expiry, audience (this app's
 * client id) and that the issuer matches the token's own tenant.
 */
const verifyIdToken = async (token, { clientId, keySet }) => {
  const { payload } = await jwtVerify(token, keySet, {
    audience: clientId,
    algorithms: ['RS256'], // Entra signs ID tokens with RS256
  });
  const tenantId = normaliseTenantId(payload.tid);
  if (
    tenantId &&
    payload.iss !== `https://login.microsoftonline.com/${tenantId}/v2.0`
  ) {
    throw new Error('Token issuer does not match its tenant');
  }
  return payload;
};

/**
 * Express middleware that only lets through requests carrying a valid Entra
 * ID token (`Authorization: Bearer <id token>`) from an approved tenant.
 *   401 - no token, or the token fails verification
 *   403 - verified, but the organisation isn't approved (or has no tid)
 *   503 - the server has no AAD client id configured to verify tokens with,
 *         or Entra's signing keys couldn't be fetched (transient: clients retry)
 * On success the verified claims are available as `req.entraClaims`.
 */
const createTenantGate = ({
  clientId = process.env.AAD_CLIENT_ID || process.env.REACT_APP_AAD_CLIENT_ID,
  approvedTenantIds = parseApprovedTenantIds(process.env.APPROVED_TENANT_IDS),
  keySet = createRemoteJWKSet(new URL(ENTRA_JWKS_URL)),
} = {}) => {
  const guardedKeySet = guardKeySet(keySet);
  return async (req, res, next) => {
    if (!clientId) {
      return res.status(503).json({
        code: 'auth_not_configured',
        message: 'AAD_CLIENT_ID is not configured on the server',
      });
    }

    const header = req.headers.authorization || '';
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    let claims;
    try {
      claims = await verifyIdToken(match[1], {
        clientId,
        keySet: guardedKeySet,
      });
    } catch (error) {
      if (error instanceof KeySetUnavailableError) {
        console.error(
          'Tenant gate: could not fetch Entra signing keys:',
          error.cause?.message || error.cause,
        );
        return res.status(503).json({
          code: 'keys_unavailable',
          message: 'Sign-in could not be checked just now. Please try again.',
        });
      }
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const tenantId = normaliseTenantId(claims.tid);
    if (!isTenantApproved(tenantId, approvedTenantIds)) {
      return res.status(403).json({
        code: 'tenant_not_approved',
        message: "Your organisation isn't set up on Zaplie yet",
        tenantId,
      });
    }

    req.entraClaims = claims;
    return next();
  };
};

module.exports = {
  KNOWALL_TENANT_ID,
  normaliseTenantId,
  parseApprovedTenantIds,
  isTenantApproved,
  verifyIdToken,
  guardKeySet,
  KeySetUnavailableError,
  createTenantGate,
};
