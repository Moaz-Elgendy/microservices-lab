const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();
app.use(cors());
app.use(express.json());

// --- Postgres setup ---
// These env vars will be injected via K8s ConfigMap/Secret later.
const pgPool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'postgres',
  database: process.env.PGDATABASE || 'postgres',
  password: process.env.PGPASSWORD || 'postgres_password',
  port: process.env.PGPORT || 5432,
});

pgPool.on('error', (err) => console.error('Unexpected PG error', err));

async function initDb() {
  const client = await pgPool.connect();
  try {
    await client.query('CREATE TABLE IF NOT EXISTS values (number INT NOT NULL)');
    console.log('Postgres table "values" is ready');
  } finally {
    client.release();
  }
}

// --- Redis setup ---
// REDIS_HOST will typically be the name of your Redis K8s Service (e.g. "redis").
const redisHost = process.env.REDIS_HOST || 'redis';
const redisPort = process.env.REDIS_PORT || 6379;

const redisPublisher = redis.createClient({ url: `redis://${redisHost}:${redisPort}` });
const redisClient = redis.createClient({ url: `redis://${redisHost}:${redisPort}` });

redisPublisher.on('error', (err) => console.error('Redis publisher error', err));
redisClient.on('error', (err) => console.error('Redis client error', err));

async function start() {
  await initDb().catch((err) => console.error('DB init failed (will keep retrying via K8s restarts):', err.message));
  await redisPublisher.connect();
  await redisClient.connect();

  app.get('/', (req, res) => {
    res.send('Server is up and healthy 🚀');
  });

  // Simple readiness/liveness endpoint - useful for K8s probes later
  app.get('/healthz', (req, res) => res.status(200).send('ok'));

  // All indexes we have ever received, stored durably in Postgres
  app.get('/values/all', async (req, res) => {
    try {
      const result = await pgPool.query('SELECT * FROM values');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch values from Postgres' });
    }
  });

  // Calculated fibonacci results, stored in Redis (fast, ephemeral cache)
  app.get('/values/current', async (req, res) => {
    try {
      const values = await redisClient.hGetAll('values');
      res.json(values);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to fetch values from Redis' });
    }
  });

  // Submit a new number to be processed
  app.post('/values', async (req, res) => {
    const index = parseInt(req.body.index, 10);

    if (Number.isNaN(index) || index < 0 || index > 40) {
      return res.status(422).json({ error: 'Index must be a whole number between 0 and 40' });
    }

    try {
      // 1. Mark it as "in progress" in Redis right away
      await redisClient.hSet('values', index, 'Calculating...');
      // 2. Tell the worker (via pub/sub) to go calculate it
      await redisPublisher.publish('insert', index.toString());
      // 3. Persist the raw submission in Postgres
      await pgPool.query('INSERT INTO values(number) VALUES($1)', [index]);

      res.status(202).json({ working: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to process value' });
    }
  });

  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
}

start().catch((err) => {
  console.error('Fatal startup error', err);
  process.exit(1);
});
