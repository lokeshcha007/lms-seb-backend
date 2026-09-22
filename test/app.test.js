import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createSebValidationHandler } from '../src/app.js';
import { createSebRequestHash } from '../src/sebValidation.js';

const config = {
  allowedOrigins: ['http://localhost:5177'],
  configKey: 'a'.repeat(64),
  browserExamKeys: ['b'.repeat(64)],
  requireBrowserExamKey: false,
  sessionSecret: 'test-session-secret-that-is-long-enough',
  tokenTtlSeconds: 300,
  allowSimulation: false,
};

const withServer = async (run) => {
  const server = createServer(createSebValidationHandler(config));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
};

test('validates evidence and verifies the issued exam-bound session', async () => {
  await withServer(async (baseUrl) => {
    const pageUrl = 'http://localhost:5177/exam/seb-check';
    const validationResponse = await fetch(`${baseUrl}/v1/seb/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5177',
        // Real SEB can add request headers automatically. The JavaScript API
        // body values refer to the current page URL and must remain authoritative.
        'X-SafeExamBrowser-ConfigKeyHash': 'f'.repeat(64),
      },
      body: JSON.stringify({
        examId: 'exam-1',
        studentId: 'student-1',
        pageUrl,
        configKeyHash: createSebRequestHash(pageUrl, config.configKey),
      }),
    });
    assert.equal(validationResponse.status, 200);
    const validation = await validationResponse.json();
    assert.equal(validation.valid, true);
    assert.ok(validation.token);

    const verifyResponse = await fetch(`${baseUrl}/v1/seb/session/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validation.token}`,
        Origin: 'http://localhost:5177',
      },
      body: JSON.stringify({ examId: 'exam-1', studentId: 'student-1' }),
    });
    assert.equal(verifyResponse.status, 200);
    assert.equal((await verifyResponse.json()).valid, true);
  });
});

test('rejects an invalid key and does not issue a session token', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/seb/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://localhost:5177',
      },
      body: JSON.stringify({
        examId: 'exam-1',
        studentId: 'student-1',
        pageUrl: 'http://localhost:5177/exam/seb-check',
        configKeyHash: 'c'.repeat(64),
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.code, 'invalid_config_key');
    assert.equal(payload.token, undefined);
  });
});

test('rejects requests from origins outside the allow-list', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/v1/seb/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://attacker.example',
      },
      body: '{}',
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).code, 'origin_not_allowed');
  });
});

test('validates SEB request headers on the bootstrap route and redirects with a session token', async () => {
  await withServer(async (baseUrl) => {
    const returnUrl = 'http://localhost:5177/exam/seb-check';
    const bootstrapUrl = new URL('/v1/seb/bootstrap', baseUrl);
    bootstrapUrl.searchParams.set('examId', 'exam-1');
    bootstrapUrl.searchParams.set('studentId', 'student-1');
    bootstrapUrl.searchParams.set('returnUrl', returnUrl);

    const response = await fetch(bootstrapUrl, {
      redirect: 'manual',
      headers: {
        'X-SafeExamBrowser-ConfigKeyHash': createSebRequestHash(
          bootstrapUrl.href,
          config.configKey
        ),
      },
    });

    assert.equal(response.status, 302);
    const destination = new URL(response.headers.get('location'));
    assert.equal(destination.origin + destination.pathname, returnUrl);
    const token = new URLSearchParams(destination.hash.slice(1)).get(
      'seb_session'
    );
    assert.ok(token);

    const verifyResponse = await fetch(`${baseUrl}/v1/seb/session/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Origin: 'http://localhost:5177',
      },
      body: JSON.stringify({ examId: 'exam-1', studentId: 'student-1' }),
    });
    assert.equal(verifyResponse.status, 200);
    assert.equal((await verifyResponse.json()).valid, true);
  });
});

test('rejects bootstrap navigation without a valid SEB Config Key header', async () => {
  await withServer(async (baseUrl) => {
    const bootstrapUrl = new URL('/v1/seb/bootstrap', baseUrl);
    bootstrapUrl.searchParams.set('examId', 'exam-1');
    bootstrapUrl.searchParams.set('studentId', 'student-1');
    bootstrapUrl.searchParams.set(
      'returnUrl',
      'http://localhost:5177/exam/seb-check'
    );

    const response = await fetch(bootstrapUrl, { redirect: 'manual' });
    const payload = await response.json();
    assert.equal(response.status, 403);
    assert.equal(payload.code, 'invalid_config_key');
  });
});
