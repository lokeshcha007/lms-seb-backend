import { createServer } from 'node:http';
import { createSebValidationHandler } from './app.js';
import { loadSebServerConfig } from './config.js';

try {
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
