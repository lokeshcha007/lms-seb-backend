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

    if (origin && !config.allowedOrigins.includes(origin)) {
      sendJson(
        response,
        403,
        { success: false, code: 'origin_not_allowed' },
        corsHeaders
      );
      return;
    }

    try {
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
