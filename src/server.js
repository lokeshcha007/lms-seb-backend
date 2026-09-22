import { createServer } from 'node:http';
import { loadEnvFile } from 'node:process';
import { createSebValidationHandler } from './app.js';
import { loadSebServerConfig } from './config.js';

try {
  // Local development reads an optional, gitignored .env file. Hosted
  // environments such as Render continue to provide process variables
  // directly, so a missing .env file is intentionally ignored.
  try {
    loadEnvFile();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const config = loadSebServerConfig();
  const server = createServer(createSebValidationHandler(config));
  server.listen(config.port, config.host, () => {
    console.log(
      `Codegnan SEB validation POC listening on http://${config.host}:${config.port}`
    );
  });
} catch (error) {
  console.error(`Unable to start SEB validation POC: ${error.message}`);
  process.exitCode = 1;
}
