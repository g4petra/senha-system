require('dotenv').config();
const { Pool } = require('pg');

function buildPoolOptions() {
  if (!process.env.DATABASE_URL) {
    if (!process.env.PGUSER && !process.env.PGPASSWORD) {
      console.warn('WARNING: DATABASE_URL environment variable is not set. Assuming default local configuration...');
    }
    return undefined;
  }

  const options = { connectionString: process.env.DATABASE_URL };
  if (process.env.PGSSLMODE === 'require') {
    options.ssl = { rejectUnauthorized: false };
  }

  return options;
}

const pool = new Pool(buildPoolOptions());

async function initDatabase(defaultPrinterConfig) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_state (
        id SMALLINT PRIMARY KEY,
        next_ticket_number INTEGER NOT NULL DEFAULT 1,
        current_video_url TEXT
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS printer_config (
        id SMALLINT PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT FALSE,
        port TEXT NOT NULL DEFAULT 'COM3',
        baud_rate INTEGER NOT NULL DEFAULT 9600
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id BIGSERIAL PRIMARY KEY,
        code VARCHAR(16) UNIQUE NOT NULL,
        type VARCHAR(16) NOT NULL CHECK (type IN ('normal', 'preferencial')),
        status VARCHAR(16) NOT NULL CHECK (status IN ('waiting', 'called')),
        desk VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        called_at TIMESTAMPTZ
      )
    `);

    await client.query(
      `
      INSERT INTO app_state (id, next_ticket_number, current_video_url)
      VALUES (1, 1, NULL)
      ON CONFLICT (id) DO NOTHING
      `
    );

    await client.query(
      `
      INSERT INTO printer_config (id, enabled, port, baud_rate)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO NOTHING
      `,
      [1, defaultPrinterConfig.enabled, defaultPrinterConfig.port, defaultPrinterConfig.baudRate]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function withTransaction(handler) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  initDatabase,
  withTransaction,
};
