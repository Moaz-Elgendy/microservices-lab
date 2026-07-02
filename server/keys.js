module.exports = {
  redisHost: process.env.REDIS_HOST || 'redis',
  redisPort: process.env.REDIS_PORT || 6379,

  pgUser: process.env.PGUSER || 'postgres',
  pgHost: process.env.PGHOST || 'postgres',
  pgDatabase: process.env.PGDATABASE || 'postgres',
  pgPassword: process.env.PGPASSWORD || 'postgres_password',
  pgPort: process.env.PGPORT || 5432,
};