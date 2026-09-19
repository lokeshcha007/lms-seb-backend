import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createSebRequestHash,
  SebValidationError,
  validateSebEvidence,
} from '../src/sebValidation.js';
import {
  issueSebSessionToken,
  verifySebSessionToken,
} from '../src/sessionToken.js';

const config = {
  allowedOrigins: ['https://exam.example'],
  configKey: 'a'.repeat(64),
  browserExamKeys: ['b'.repeat(64)],
  requireBrowserExamKey: true,
  allowSimulation: false,
};

test('accepts matching Config Key and Browser Exam Key request hashes', () => {
  const pageUrl = 'https://exam.example/exam/seb-check?attempt=1';
  const result = validateSebEvidence({
    config,
    evidence: {
      pageUrl,
      configKeyHash: createSebRequestHash(pageUrl, config.configKey),
      browserExamKeyHash: createSebRequestHash(
        pageUrl,
        config.browserExamKeys[0]
      ),
    },
  });

  assert.equal(result.valid, true);
  assert.equal(result.configKeyValid, true);
  assert.equal(result.browserExamKeyValid, true);
});

test('rejects an invalid Config Key request hash', () => {
  assert.throws(
    () =>
      validateSebEvidence({
        config,
        evidence: {
          pageUrl: 'https://exam.example/exam/seb-check',
          configKeyHash: 'c'.repeat(64),
          browserExamKeyHash: 'd'.repeat(64),
        },
      }),
    (error) =>
      error instanceof SebValidationError && error.code === 'invalid_config_key'
  );
});

test('rejects page URLs from unapproved origins', () => {
  assert.throws(
    () =>
      validateSebEvidence({
        config,
        evidence: {
          pageUrl: 'https://attacker.example/exam/seb-check',
          configKeyHash: 'c'.repeat(64),
        },
      }),
    (error) => error.code === 'origin_not_allowed'
  );
});

test('local simulation requires an explicit server setting', () => {
  assert.throws(
    () =>
      validateSebEvidence({
        config,
        evidence: {
          pageUrl: 'https://exam.example/exam/seb-check',
          simulated: true,
        },
      }),
    (error) => error.code === 'simulation_disabled'
  );

  const result = validateSebEvidence({
    config: { ...config, allowSimulation: true },
    evidence: {
      pageUrl: 'https://exam.example/exam/seb-check',
      simulated: true,
    },
  });
  assert.equal(result.source, 'local_simulation');
});

test('session tokens are signed, expire, and are bound to exam and student', () => {
  const secret = 's'.repeat(32);
  const now = Date.parse('2026-09-16T10:00:00Z');
  const token = issueSebSessionToken(
    {
      examId: 'exam-1',
      studentId: 'student-1',
      pageUrl: 'https://exam.example/exam/seb-check',
      sebVersion: '3.9.0',
    },
    { secret, ttlSeconds: 300, now }
  );

  assert.ok(
    verifySebSessionToken(token, {
      secret,
      examId: 'exam-1',
      studentId: 'student-1',
      now: now + 1000,
    })
  );
  assert.equal(
    verifySebSessionToken(token, {
      secret,
      examId: 'exam-2',
      studentId: 'student-1',
      now: now + 1000,
    }),
    null
  );
  assert.equal(
    verifySebSessionToken(token, {
      secret,
      examId: 'exam-1',
      studentId: 'student-1',
      now: now + 301000,
    }),
    null
  );
});
