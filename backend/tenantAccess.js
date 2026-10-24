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
 *   503 - the server has no AAD client id configured to verify tokens with
 * On success the verified claims are available as `req.entraClaims`.
 */
const createTenantGate = ({
  clientId = process.env.AAD_CLIENT_ID || process.env.REACT_APP_AAD_CLIENT_ID,
  approvedTenantIds = parseApprovedTenantIds(process.env.APPROVED_TENANT_IDS),
  keySet = createRemoteJWKSet(new URL(ENTRA_JWKS_URL)),
} = {}) => {
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
      claims = await verifyIdToken(match[1], { clientId, keySet });
    } catch {
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
  createTenantGate,
};
