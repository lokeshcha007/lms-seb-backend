import assert from 'node:assert/strict';
import test from 'node:test';

import { loadSebServerConfig } from '../src/config.js';

const validEnvironment = {
  SEB_ALLOWED_ORIGINS: 'https://exam-staging.codegnan.ai',
  SEB_CONFIG_KEY: 'a'.repeat(64),
  SEB_SESSION_SECRET: 'staging-secret-with-at-least-32-characters',
};

test('uses the platform PORT when Render provides one', () => {
  const config = loadSebServerConfig({
    ...validEnvironment,
    PORT: '10000',
    SEB_PORT: '43126',
  });

  assert.equal(config.port, 10000);
});

test('uses SEB_PORT when no platform port is provided', () => {
  const config = loadSebServerConfig({
    ...validEnvironment,
    SEB_PORT: '43126',
  });

  assert.equal(config.port, 43126);
});
