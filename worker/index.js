const redis = require('redis');
const keys = require('./keys');

// Separate connections for subscribing and publishing/writing (node-redis requirement)
const sub = redis.createClient({
  url: `redis://${keys.redisHost}:${keys.redisPort}`
});

const pub = redis.createClient({
  url: `redis://${keys.redisHost}:${keys.redisPort}`
});

sub.on('error', (err) => console.error('Redis sub error', err));
pub.on('error', (err) => console.error('Redis pub error', err));

// Deliberately naive recursive fibonacci - it's slow on purpose.
// This gives you something visibly "working" to watch scale in K8s
// (try bumping replicas on the worker Deployment and see throughput change).
function fib(n) {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}

async function start() {
  await sub.connect();
  await pub.connect();

  await sub.subscribe('insert', async (message) => {
    const index = parseInt(message, 10);
    console.log(`[worker] received index ${index}, calculating...`);

    const result = fib(index);

    await pub.hSet('values', index, result.toString());
    console.log(`[worker] fib(${index}) = ${result} (saved to redis)`);
  });

  console.log('[worker] listening for new values on the "insert" channel');
}

start().catch((err) => {
  console.error('Fatal worker startup error', err);
  process.exit(1);
});
