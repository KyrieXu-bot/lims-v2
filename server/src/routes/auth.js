import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv'; dotenv.config();
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const ADMIN_PASS_BCRYPT = process.env.ADMIN_PASS_BCRYPT || '';

const router = Router();
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  console.log(username, password);
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  if (username !== ADMIN_USER) return res.status(401).json({ error: 'Invalid credentials' });
  let ok = false;
  if (ADMIN_PASS_BCRYPT) ok = await bcrypt.compare(password, ADMIN_PASS_BCRYPT);
  else ok = password === ADMIN_PASS;
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ sub: 'admin', username: ADMIN_USER, role: 'admin' }, SECRET, { expiresIn: '7d' });
  res.json({ token, role: 'admin', username: ADMIN_USER });
});
export default router;
