const crypto = require('crypto');
const https = require('https');
const { error } = require('./response');

/**
 * Autenticación y roles.
 *
 * Funciona de dos maneras:
 *  1) Si la ruta tiene un JWT authorizer en API Gateway, usa las claims que éste ya validó.
 *  2) Si no lo tiene, la Lambda valida ella misma el token de Microsoft Entra ID
 *     (firma RS256 con las llaves públicas de Entra, vencimiento, emisor y audiencia).
 *
 * Los valores por defecto corresponden a tu tenant y a tu API registrada en Entra
 * (los mismos de VITE_AZURE_TENANT_ID y VITE_API_SCOPE del frontend). Se pueden
 * cambiar con las variables de entorno TENANT_ID y API_CLIENT_ID.
 */
const TENANT_ID = process.env.TENANT_ID || '9830b259-880d-4e5f-8aea-f5924fc25bad';
const API_CLIENT_ID = process.env.API_CLIENT_ID || '9b35f442-bb3e-412d-a1c1-06fd345d4f57';

// Entra emite tokens v1 o v2 según la configuración de la app; se aceptan ambos formatos.
const ISSUERS = [
  `https://sts.windows.net/${TENANT_ID}/`,
  `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
];
const AUDIENCES = [API_CLIENT_ID, `api://${API_CLIENT_ID}`];
const JWKS_URL = `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`;
const JWKS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_S = 60;

function defaultFetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on('error', reject);
  });
}

let fetchJson = defaultFetchJson;
let jwksCache = { keys: [], at: 0 };

async function getPublicKey(kid) {
  const isFresh = Date.now() - jwksCache.at < JWKS_TTL_MS;
  let jwk = isFresh ? jwksCache.keys.find((k) => k.kid === kid) : undefined;
  if (!jwk) {
    let data;
    try {
      data = await fetchJson(JWKS_URL);
    } catch (e) {
      console.error('No se pudieron descargar las llaves de Entra:', e);
      throw Object.assign(new Error('jwks'), { server: true });
    }
    jwksCache = { keys: data.keys || [], at: Date.now() };
    jwk = jwksCache.keys.find((k) => k.kid === kid);
  }
  return jwk ? crypto.createPublicKey({ key: jwk, format: 'jwk' }) : null;
}

async function verifyToken(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('formato');

  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (header.alg !== 'RS256') throw new Error('algoritmo no permitido');

  const key = await getPublicKey(header.kid);
  if (!key) throw new Error('llave desconocida');

  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    Buffer.from(parts[2], 'base64url'),
  );
  if (!valid) throw new Error('firma inválida');

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_SKEW_S < now) throw new Error('token vencido');
  if (typeof payload.nbf === 'number' && payload.nbf - CLOCK_SKEW_S > now) throw new Error('token aún no válido');
  if (!ISSUERS.includes(payload.iss)) throw new Error('emisor no permitido');
  if (![].concat(payload.aud).some((a) => AUDIENCES.includes(a))) throw new Error('audiencia no permitida');

  return payload;
}

/** Un array de roles puede llegar como array, como "[Admin Operador]" o como '["Admin","Operador"]'. */
function normalizeRoles(raw) {
  let list = raw ?? [];
  if (typeof list === 'string') list = list.replace(/^\[|\]$/g, '').split(/[\s,]+/);
  return [].concat(list)
    .map((r) => String(r).replace(/^"+|"+$/g, '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Devuelve { status, roles }:
 *  - "ok"      token válido (roles en minúsculas)
 *  - "none"    no vino token
 *  - "invalid" token inválido o vencido
 *  - "error"   falló algo del lado del servidor al validar
 */
async function authenticate(event) {
  const claims = event.requestContext?.authorizer?.jwt?.claims;
  if (claims) return { status: 'ok', roles: normalizeRoles(claims.roles ?? claims.role) };

  const header = event.headers?.authorization || event.headers?.Authorization;
  if (!header || !/^Bearer\s+/i.test(header)) return { status: 'none', roles: [] };

  try {
    const payload = await verifyToken(header.replace(/^Bearer\s+/i, '').trim());
    return { status: 'ok', roles: normalizeRoles(payload.roles ?? payload.role) };
  } catch (e) {
    if (e.server) return { status: 'error', roles: [] };
    console.warn('Token rechazado:', e.message);
    return { status: 'invalid', roles: [] };
  }
}

/**
 * Devuelve una respuesta de error (401/403/500) si el usuario no puede continuar,
 * o null si tiene alguno de los roles permitidos.
 */
async function requireRole(event, allowed) {
  const { status, roles } = await authenticate(event);
  if (status === 'none') return error(401, 'Falta el token de acceso');
  if (status === 'invalid') return error(401, 'Token inválido o vencido: cierra sesión y vuelve a entrar');
  if (status === 'error') return error(500, 'No se pudo validar el token');
  const ok = allowed.some((a) => roles.includes(a.toLowerCase()));
  return ok ? null : error(403, 'No tienes permiso para realizar esta acción');
}

module.exports = {
  requireRole,
  authenticate,
  verifyToken,
  // Solo para pruebas
  _setFetchJson: (fn) => { fetchJson = fn; jwksCache = { keys: [], at: 0 }; },
};
