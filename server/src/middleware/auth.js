import jwt from 'jsonwebtoken';
import dotenv from 'dotenv'; dotenv.config();
const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}

export function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.role === 'admin') return next();
    
    // 如果传入的是字符串，转换为数组
    const rolesArray = Array.isArray(roles) ? roles : [roles];
    
    const userRoles = req.user.roles || [req.user.role];
    const hasRole = rolesArray.some(role => userRoles.includes(role));
    
    if (!hasRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

export function requireAnyRole(roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.role === 'admin') return next();
    
    // 确保 roles 是数组
    const rolesArray = Array.isArray(roles) ? roles : [roles];
    
    const userRoles = req.user.roles || [req.user.role];
    const hasAnyRole = rolesArray.some(role => userRoles.includes(role));
    
    if (!hasAnyRole) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
