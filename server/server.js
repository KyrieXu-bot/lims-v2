import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRouter from './src/routes/auth.js';
import customersRouter from './src/routes/customers.js';
import payersRouter from './src/routes/payers.js';
import commissionersRouter from './src/routes/commissioners.js';
import { getPool } from './src/db.js';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get('/api/health', async (req, res) => {
  try {
    const pool = await getPool();
    const [rows] = await pool.query('SELECT 1 AS ok');
    res.json({ ok: true, db: rows[0].ok === 1, service: 'lims-server-mysql' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/customers', customersRouter);
app.use('/api/payers', payersRouter);
app.use('/api/commissioners', commissionersRouter);

app.listen(PORT, () => console.log(`[LIMS] Server running on http://localhost:${PORT}`));
