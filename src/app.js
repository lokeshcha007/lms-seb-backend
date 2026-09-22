import { issueSebSessionToken, verifySebSessionToken } from './sessionToken.js';
import { SebValidationError, validateSebEvidence } from './sebValidation.js';

const MAX_BODY_BYTES = 32 * 1024;

const sendJson = (response, status, body, headers = {}) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(body));
};

const sendRedirect = (response, location) => {
  response.writeHead(302, {
    Location: location,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  response.end();
};

const readJson = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new SebValidationError(
        'request_too_large',
        'The request body is too large.',
        413
      );
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new SebValidationError(
      'invalid_json',
      'The request body must be valid JSON.',
      400
    );
  }
};

const requiredIdentifier = (value, name) => {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > 200) {
    throw new SebValidationError(
      'invalid_request',
      `${name} is required.`,
      400
    );
  }
  return normalized;
};

const requiredReturnUrl = (value, allowedOrigins) => {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new SebValidationError(
      'invalid_return_url',
      'A valid exam return URL is required.',
      400
    );
  }

  if (!allowedOrigins.includes(parsed.origin)) {
    throw new SebValidationError(
      'invalid_return_url',
      'The exam return URL is not allowed.'
    );
  }

  parsed.hash = '';
  return parsed.href;
};

const getPublicRequestUrl = (request) => {
  const forwardedProtocol = String(request.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  const forwardedHost = String(request.headers['x-forwarded-host'] || '')
    .split(',')[0]
    .trim();
  const protocol =
    forwardedProtocol || (request.socket.encrypted ? 'https' : 'http');
  const host = forwardedHost || request.headers.host;
  return new URL(request.url, `${protocol}://${host}`).href;
};

const getBearerToken = (request) => {
  const authorization = String(request.headers.authorization || '');
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
};

export const createSebValidationHandler =
  (config) => async (request, response) => {
    const origin = String(request.headers.origin || '');
    const corsHeaders = {
      Vary: 'Origin',
      ...(config.allowedOrigins.includes(origin)
        ? { 'Access-Control-Allow-Origin': origin }
        : {}),
    };

    if (request.method === 'OPTIONS') {
      if (!config.allowedOrigins.includes(origin)) {
        sendJson(response, 403, { success: false, code: 'origin_not_allowed' });
        return;
      }
      response.writeHead(204, {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers':
          'Content-Type, Authorization, X-SafeExamBrowser-ConfigKeyHash, X-SafeExamBrowser-RequestHash',
        'Access-Control-Max-Age': '600',
      });
      response.end();
      return;
    }

    const requestUrl = new URL(request.url, 'http://localhost');
    const isHeaderBootstrap =
      request.method === 'GET' && requestUrl.pathname === '/v1/seb/bootstrap';
    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      sendJson(
        response,
        200,
        {
          success: true,
          service: 'codegnan-seb-validation-poc',
          version: '0.1.0',
          simulationEnabled: config.allowSimulation,
        },
        corsHeaders
      );
      return;
    }

    if (
      !isHeaderBootstrap &&
      origin &&
      !config.allowedOrigins.includes(origin)
    ) {
      sendJson(
        response,
        403,
        { success: false, code: 'origin_not_allowed' },
        corsHeaders
      );
      return;
    }

    try {
      if (isHeaderBootstrap) {
        const examId = requiredIdentifier(
          requestUrl.searchParams.get('examId'),
          'examId'
        );
        const studentId = requiredIdentifier(
          requestUrl.searchParams.get('studentId'),
          'studentId'
        );
        const returnUrl = requiredReturnUrl(
          requestUrl.searchParams.get('returnUrl'),
          config.allowedOrigins
        );
        const pageUrl = getPublicRequestUrl(request);
        const pageOrigin = new URL(pageUrl).origin;

        validateSebEvidence({
          config: {
            ...config,
            allowedOrigins: [
              ...new Set([...config.allowedOrigins, pageOrigin]),
            ],
          },
          evidence: {
            pageUrl,
            sebVersion: null,
            simulated: false,
            configKeyHash: request.headers['x-safeexambrowser-configkeyhash'],
            browserExamKeyHash:
              request.headers['x-safeexambrowser-requesthash'],
          },
        });

        const token = issueSebSessionToken(
          {
            examId,
            studentId,
            pageUrl: returnUrl,
            sebVersion: 'http-header-validation',
            simulated: false,
          },
          {
            secret: config.sessionSecret,
            ttlSeconds: config.tokenTtlSeconds,
          }
        );
        const destination = new URL(returnUrl);
        const fragment = new URLSearchParams(destination.hash.slice(1));
        fragment.set('seb_session', token);
        destination.hash = fragment.toString();
        sendRedirect(response, destination.href);
        return;
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/v1/seb/validate'
      ) {
        const body = await readJson(request);
        const examId = requiredIdentifier(body.examId, 'examId');
        const studentId = requiredIdentifier(body.studentId, 'studentId');
        const validation = validateSebEvidence({
          config,
          evidence: {
            pageUrl: body.pageUrl,
            sebVersion: body.sebVersion,
            simulated: body.simulated === true,
            configKeyHash:
              body.configKeyHash ||
              request.headers['x-safeexambrowser-configkeyhash'],
            browserExamKeyHash:
              body.browserExamKeyHash ||
              request.headers['x-safeexambrowser-requesthash'],
          },
        });
        const token = issueSebSessionToken(
          {
            examId,
            studentId,
            pageUrl: validation.pageUrl,
            sebVersion: body.sebVersion,
            simulated: validation.simulated,
          },
          {
            secret: config.sessionSecret,
            ttlSeconds: config.tokenTtlSeconds,
          }
        );

        sendJson(
          response,
          200,
          {
            success: true,
            valid: true,
            source: validation.source,
            simulated: validation.simulated,
            configKeyValid: validation.configKeyValid,
            browserExamKeyValid: validation.browserExamKeyValid,
            token,
            expiresInSeconds: config.tokenTtlSeconds,
          },
          corsHeaders
        );
        return;
      }

      if (
        request.method === 'POST' &&
        requestUrl.pathname === '/v1/seb/session/verify'
      ) {
        const body = await readJson(request);
        const examId = requiredIdentifier(body.examId, 'examId');
        const studentId = requiredIdentifier(body.studentId, 'studentId');
        const claims = verifySebSessionToken(getBearerToken(request), {
          secret: config.sessionSecret,
          examId,
          studentId,
        });
        if (!claims) {
          throw new SebValidationError(
            'invalid_session',
            'The SEB validation session is missing, expired, or invalid.'
          );
        }

        sendJson(
          response,
          200,
          { success: true, valid: true, claims },
          corsHeaders
        );
        return;
      }

      sendJson(
        response,
        404,
        { success: false, code: 'not_found' },
        corsHeaders
      );
    } catch (error) {
      const known = error instanceof SebValidationError;
      sendJson(
        response,
        known ? error.status : 500,
        {
          success: false,
          code: known ? error.code : 'internal_error',
          message: known
            ? error.message
            : 'SEB validation failed unexpectedly.',
        },
        corsHeaders
      );
    }
  };
