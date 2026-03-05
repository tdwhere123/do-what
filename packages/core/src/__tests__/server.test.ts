import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { startHttpServer, type HttpServerHandle } from '../server/http.js';

const activeServers: HttpServerHandle[] = [];
const tempDirs: string[] = [];

async function startTestServer(
  isDevelopment = true,
): Promise<{ baseUrl: string; token: string }> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'do-what-core-'));
  tempDirs.push(tempDir);

  const sessionTokenPath = path.join(tempDir, 'run', 'session_token');
  const server = await startHttpServer({
    host: '127.0.0.1',
    isDevelopment,
    logger: false,
    port: 0,
    sessionTokenPath,
    skipSignalHandlers: true,
  });

  activeServers.push(server);

  const token = fs.readFileSync(sessionTokenPath, 'utf8').trim();
  return {
    baseUrl: `http://127.0.0.1:${server.port}`,
    token,
  };
}

afterEach(async () => {
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    if (server) {
      await server.stop();
    }
  }

  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { force: true, recursive: true });
    }
  }
});

describe('HTTP server auth and SSE', () => {
  it('returns health without auth', async () => {
    const { baseUrl } = await startTestServer();
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.ok, true);
  });

  it('rejects unauthenticated state requests', async () => {
    const { baseUrl } = await startTestServer();
    const response = await fetch(`${baseUrl}/state`);

    assert.equal(response.status, 401);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal(body.error, 'Unauthorized');
  });

  it('accepts authenticated state requests', async () => {
    const { baseUrl, token } = await startTestServer();
    const response = await fetch(`${baseUrl}/state`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    assert.equal(response.status, 200);
    const body = (await response.json()) as Record<string, unknown>;
    assert.deepEqual(body, {});
  });

  it('streams SSE events from development publish route', async () => {
    const { baseUrl, token } = await startTestServer(true);

    await new Promise<void>((resolve, reject) => {
      const request = http.request(
        `${baseUrl}/events`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        (response) => {
          assert.equal(response.statusCode, 200);
          const contentType = response.headers['content-type'];
          assert.ok(typeof contentType === 'string');
          assert.match(contentType, /text\/event-stream/);

          response.setEncoding('utf8');

          const eventText = '"runId":"run-test"';
          let buffer = '';

          response.on('data', (chunk) => {
            buffer += chunk;
            if (buffer.includes(eventText)) {
              request.destroy();
              resolve();
            }
          });

          response.on('error', reject);

          void fetch(`${baseUrl}/_dev/publish`, {
            body: JSON.stringify({
              revision: 1,
              runId: 'run-test',
              source: 'test',
              timestamp: new Date().toISOString(),
            }),
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
          })
            .then(async (publishResponse) => {
              assert.equal(publishResponse.status, 200);
            })
            .catch(reject);
        },
      );

      request.on('error', reject);
      request.end();
    });
  });
});
