import mysql from 'mysql2/promise';
import dotenv from 'dotenv'; dotenv.config();

let pool;
export async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'lims',
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
      charset: 'utf8mb4'
    });
  }
  return pool;
}
