import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPool } from '../db.js';
import dotenv from 'dotenv'; dotenv.config();

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const ADMIN_PASS_BCRYPT = process.env.ADMIN_PASS_BCRYPT || '';

const router = Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  try {
    // 首先检查是否是管理员
    if (username === ADMIN_USER) {
      let ok = false;
      if (ADMIN_PASS_BCRYPT) ok = await bcrypt.compare(password, ADMIN_PASS_BCRYPT);
      else ok = password === ADMIN_PASS;
      if (ok) {
        const token = jwt.sign({ sub: 'admin', username: ADMIN_USER, role: 'admin' }, SECRET, { expiresIn: '7d' });
        return res.json({ token, role: 'admin', username: ADMIN_USER, user_id: 'admin' });
      }
    }

    // 检查普通用户
    const pool = await getPool();
    const [users] = await pool.query(
      `SELECT u.*, r.role_code, r.role_name
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.user_id
       LEFT JOIN roles r ON r.role_id = ur.role_id
       WHERE u.account = ? AND u.is_active = 1`,
      [username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 验证密码
    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 获取用户的所有角色
    const [roles] = await pool.query(
      `SELECT r.role_code, r.role_name
       FROM user_roles ur
       JOIN roles r ON r.role_id = ur.role_id
       WHERE ur.user_id = ?`,
      [user.user_id]
    );

    const userRoles = roles.map(r => r.role_code);
    const roleNames = roles.map(r => r.role_name);

    const primaryRole = userRoles[0] || 'member';
    const primaryRoleNames = roleNames[0] || '成员';

    const token = jwt.sign({ 
      sub: user.user_id, 
      username: user.account, 
      role: primaryRole,
      role_name: primaryRoleNames,
      roles: userRoles,
      user_id: user.user_id,
      name: user.name,
      group_id: user.group_id,
      department_id: user.department_id || null
    }, SECRET, { expiresIn: '7d' });

    res.json({ 
      token, 
      role: primaryRole, 
      role_name: primaryRoleNames,
      roles: userRoles,
      username: user.account, 
      user_id: user.user_id,
      name: user.name,
      group_id: user.group_id,
      department_id: user.department_id || null
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
