import IORedis, { type Redis } from 'ioredis';

let connection: Redis | undefined;

export function getRedisConnection(): Redis {
  if (connection) return connection;

  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is not set');
  }

  connection = new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // Railway private DNS may return IPv6; 0 = dual stack.
    family: 0,
  });

  connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[redis] error:', err.message);
  });

  return connection;
}

export async function closeRedisConnection(): Promise<void> {
  if (connection) {
    await connection.quit();
    connection = undefined;
  }
}
