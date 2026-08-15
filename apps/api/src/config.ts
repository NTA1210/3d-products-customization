export type RedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db: number;
  tls?: Record<string, never>;
  maxRetriesPerRequest?: number | null;
};

export function redisConnectionFromEnv(forWorker = false): RedisConnectionOptions {
  const value = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const url = new URL(value);
  const dbPath = url.pathname.replace(/^\//, '');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: dbPath ? Number(dbPath) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: forWorker ? null : 1,
  };
}

export function requiredEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
