import mysql from 'mysql2/promise';
import dotenv from 'dotenv'; dotenv.config();

let pool;
export async function getPool() {
  if (!pool) {
    const dbConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'lims',
      waitForConnections: true,
      connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
      charset: 'utf8mb4'
    };
    
    console.log(`[DB Config] Host: ${dbConfig.host}, User: ${dbConfig.user}, Database: ${dbConfig.database}`);
    
    pool = mysql.createPool(dbConfig);
    
    // 验证连接
    try {
      const testConn = await pool.getConnection();
      const [result] = await testConn.query('SELECT DATABASE() as currentDb');
      console.log(`[DB] Successfully connected to: ${result[0].currentDb}`);
      testConn.release();
    } catch (error) {
      console.error(`[DB] Connection error:`, error.message);
    }
  }
  return pool;
}
