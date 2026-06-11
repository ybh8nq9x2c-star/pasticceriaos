// =============================================================================
// lib/supplier-token.ts
// JWT HS256 per il portale fornitore — implementato con WebCrypto nativo
// (niente dipendenza `jose`: nessuna shell disponibile per npm install, e
// l'API crypto.subtle copre HS256 in Node 18+ ed Edge runtime).
//
// Il payload include tokenVersion: rigenerare il link dalla scheda fornitore
// incrementa suppliers.portal_token_version e revoca i token precedenti.
// =============================================================================

import 'server-only';

export interface SupplierTokenPayload {
  supplierId: string;
  organizationId: string;
  tokenVersion: number;
  scope: 'supplier_portal';
  iat: number;
  exp: number;
}

const ONE_YEAR_S = 60 * 60 * 24 * 365;

function getSecret(): Uint8Array {
  const secret = process.env.SUPPLIER_TOKEN_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SUPPLIER_TOKEN_SECRET mancante o troppo corto: configura .env.local');
  }
  return new TextEncoder().encode(secret);
}

function b64url(data: Uint8Array): string {
  return Buffer.from(data).toString('base64url');
}

function b64urlJson(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

async function hmacKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    getSecret() as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function generateSupplierToken(
  supplierId: string,
  organizationId: string,
  tokenVersion: number,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SupplierTokenPayload = {
    supplierId,
    organizationId,
    tokenVersion,
    scope: 'supplier_portal',
    iat: now,
    exp: now + ONE_YEAR_S,
  };
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const body = b64urlJson(payload);
  const signingInput = `${header}.${body}`;
  const key = await hmacKey();
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput) as unknown as BufferSource,
  );
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

export async function verifySupplierToken(token: string): Promise<SupplierTokenPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token malformato');
  const [header, body, signature] = parts;

  const key = await hmacKey();
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    Buffer.from(signature, 'base64url') as unknown as BufferSource,
    new TextEncoder().encode(`${header}.${body}`) as unknown as BufferSource,
  );
  if (!valid) throw new Error('Firma token non valida');

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SupplierTokenPayload;
  if (payload.scope !== 'supplier_portal') throw new Error('Scope token non valido');
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token scaduto');
  }
  if (!payload.supplierId || !payload.organizationId || typeof payload.tokenVersion !== 'number') {
    throw new Error('Payload token incompleto');
  }
  return payload;
}
