import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

const encode = (value) => Buffer.from(value).toString('base64url');
const sign = (value, secret) =>
  createHmac('sha256', secret).update(value).digest('base64url');

export const issueSebSessionToken = (
  claims,
  { secret, ttlSeconds, now = Date.now() }
) => {
  const issuedAt = Math.floor(now / 1000);
  const payload = {
    typ: 'seb-poc',
    examId: claims.examId,
    studentId: claims.studentId,
    pageOrigin: new URL(claims.pageUrl).origin,
    sebVersion: claims.sebVersion || null,
    simulated: claims.simulated === true,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    jti: randomUUID(),
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
};

export const verifySebSessionToken = (
  token,
  { secret, examId, studentId, now = Date.now() }
) => {
  const [encodedPayload, providedSignature, extra] = String(token || '').split(
    '.'
  );
  if (!encodedPayload || !providedSignature || extra) return null;

  const expectedSignature = sign(encodedPayload, secret);
  const left = Buffer.from(providedSignature);
  const right = Buffer.from(expectedSignature);
  if (left.length !== right.length || !timingSafeEqual(left, right))
    return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString());
  } catch {
    return null;
  }

  const nowSeconds = Math.floor(now / 1000);
  if (
    payload.typ !== 'seb-poc' ||
    payload.exp <= nowSeconds ||
    payload.examId !== examId ||
    payload.studentId !== studentId
  ) {
    return null;
  }

  return payload;
};
