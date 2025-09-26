import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import authRouter from './src/routes/auth.js';
import customersRouter from './src/routes/customers.js';
import payersRouter from './src/routes/payers.js';
import commissionersRouter from './src/routes/commissioners.js';
import priceRouter from './src/routes/price.js';
import testItemsRouter from './src/routes/test_items.js';
import ordersRouter from './src/routes/orders.js';
import outsourceRouter from './src/routes/outsource.js';
import usersRouter from './src/routes/users.js';
import equipmentRouter from './src/routes/equipment.js';
import sampleTrackingRouter from './src/routes/sample_tracking.js';
import filesRouter from './src/routes/files.js';
import commissionFormRouter from './src/routes/commission_form.js';
import { setupSocket } from './src/socket.js';
import { getPool } from './src/db.js';

dotenv.config();
const app = express();
const server = createServer(app);
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
app.use('/api/price', priceRouter);
app.use('/api/test-items', testItemsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/outsource', outsourceRouter);
app.use('/api/users', usersRouter);
app.use('/api/equipment', equipmentRouter);
app.use('/api/sample-tracking', sampleTrackingRouter);
app.use('/api/files', filesRouter);
app.use('/api/commission-form', commissionFormRouter);

// 设置WebSocket
const io = setupSocket(server);

server.listen(PORT, () => console.log(`[LIMS] Server running on http://localhost:${PORT}`));
