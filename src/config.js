const parseBoolean = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase() === 'true';

const splitCsv = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const requireHexKey = (value, name, { optional = false } = {}) => {
  const key = String(value || '')
    .trim()
    .toLowerCase();
  if (!key && optional) return null;
  if (!/^[a-f0-9]{64}$/.test(key)) {
    throw new Error(`${name} must be a 64-character hexadecimal value.`);
  }
  return key;
};

export const loadSebServerConfig = (environment = process.env) => {
  // Render and similar platforms assign the public service port through PORT.
  // Keep SEB_PORT as the local-development fallback.
  const port = Number(environment.PORT || environment.SEB_PORT || 43126);
  const host = String(environment.SEB_HOST || '127.0.0.1').trim();
  const tokenTtlSeconds = Number(environment.SEB_SESSION_TTL_SECONDS || 300);
  const sessionSecret = String(environment.SEB_SESSION_SECRET || '');
  const allowedOrigins = splitCsv(
    environment.SEB_ALLOWED_ORIGINS ||
      'http://localhost:5173,http://localhost:5177'
  );

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT or SEB_PORT must be a valid TCP port.');
  }
  if (!host) {
    throw new Error('SEB_HOST is required.');
  }
  if (!Number.isFinite(tokenTtlSeconds) || tokenTtlSeconds < 30) {
    throw new Error('SEB_SESSION_TTL_SECONDS must be at least 30 seconds.');
  }
  if (sessionSecret.length < 32) {
    throw new Error('SEB_SESSION_SECRET must contain at least 32 characters.');
  }
  if (!allowedOrigins.length) {
    throw new Error('SEB_ALLOWED_ORIGINS must contain at least one origin.');
  }

  const browserExamKeys = splitCsv(environment.SEB_BROWSER_EXAM_KEYS).map(
    (key, index) => requireHexKey(key, `SEB_BROWSER_EXAM_KEYS[${index}]`)
  );
  const requireBrowserExamKey = parseBoolean(
    environment.SEB_REQUIRE_BROWSER_EXAM_KEY
  );

  if (requireBrowserExamKey && !browserExamKeys.length) {
    throw new Error(
      'SEB_BROWSER_EXAM_KEYS is required when SEB_REQUIRE_BROWSER_EXAM_KEY=true.'
    );
  }

  const configKeys = splitCsv(
    environment.SEB_CONFIG_KEYS || environment.SEB_CONFIG_KEY
  ).map((key, index) => requireHexKey(key, `SEB_CONFIG_KEYS[${index}]`));
  if (!configKeys.length) {
    throw new Error('SEB_CONFIG_KEY or SEB_CONFIG_KEYS is required.');
  }

  return {
    port,
    host,
    allowedOrigins,
    // Keep configKey for backward compatibility with existing integrations.
    configKey: configKeys[0],
    configKeys,
    browserExamKeys,
    requireBrowserExamKey,
    sessionSecret,
    tokenTtlSeconds,
    allowSimulation:
      environment.NODE_ENV !== 'production' &&
      parseBoolean(environment.SEB_ALLOW_SIMULATION),
  };
};
