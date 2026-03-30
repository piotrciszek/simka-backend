import mysql from 'mysql2/promise';

// Walidacja na starcie — lepszy komunikat błędu niż "connection refused" w runtime
const DB_HOST = process.env.DB_HOST;
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
  throw new Error(
    'Brak wymaganych zmiennych środowiskowych: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME',
  );
}

const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+01:00',
});

export default pool;
