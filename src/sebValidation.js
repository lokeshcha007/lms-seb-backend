import { createHash, timingSafeEqual } from 'node:crypto';

const SHA256_HEX = /^[a-f0-9]{64}$/i;

export class SebValidationError extends Error {
  constructor(code, message, status = 403) {
    super(message);
    this.name = 'SebValidationError';
    this.code = code;
    this.status = status;
  }
}

export const normalizePageUrl = (pageUrl, allowedOrigins) => {
  let parsed;
  try {
    parsed = new URL(pageUrl);
  } catch {
    throw new SebValidationError(
      'invalid_page_url',
      'The exam page URL is invalid.',
      400
    );
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new SebValidationError(
      'invalid_page_url',
      'The exam page URL must use HTTP or HTTPS.',
      400
    );
  }
  if (!allowedOrigins.includes(parsed.origin)) {
    throw new SebValidationError(
      'origin_not_allowed',
      'The exam page origin is not allowed.'
    );
  }

  parsed.hash = '';
  return parsed.href;
};

export const createSebRequestHash = (pageUrl, key) =>
  createHash('sha256').update(`${pageUrl}${key}`, 'utf8').digest('hex');

const safeHashEqual = (provided, expected) => {
  if (!SHA256_HEX.test(String(provided || ''))) return false;
  const left = Buffer.from(String(provided).toLowerCase(), 'hex');
  const right = Buffer.from(String(expected).toLowerCase(), 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};

export const validateSebEvidence = ({ evidence, config }) => {
  const pageUrl = normalizePageUrl(evidence.pageUrl, config.allowedOrigins);

  if (evidence.simulated === true) {
    if (!config.allowSimulation) {
      throw new SebValidationError(
        'simulation_disabled',
        'Local SEB simulation is disabled.'
      );
    }
    return {
      valid: true,
      pageUrl,
      source: 'local_simulation',
      simulated: true,
      configKeyValid: true,
      browserExamKeyValid: !config.requireBrowserExamKey,
    };
  }

  const configKeyHash = evidence.configKeyHash;
  const expectedConfigHash = createSebRequestHash(pageUrl, config.configKey);
  if (!safeHashEqual(configKeyHash, expectedConfigHash)) {
    throw new SebValidationError(
      'invalid_config_key',
      'Safe Exam Browser Config Key validation failed.'
    );
  }

  const browserExamKeyHash = evidence.browserExamKeyHash;
  const browserExamKeyValid = config.browserExamKeys.some((key) =>
    safeHashEqual(browserExamKeyHash, createSebRequestHash(pageUrl, key))
  );

  if (config.requireBrowserExamKey && !browserExamKeyValid) {
    throw new SebValidationError(
      'invalid_browser_exam_key',
      'Safe Exam Browser Exam Key validation failed.'
    );
  }

  return {
    valid: true,
    pageUrl,
    source: 'safe_exam_browser',
    simulated: false,
    configKeyValid: true,
    browserExamKeyValid,
  };
};
