import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import UserSession from '../models/UserSession.js';
import { touchUserSession } from '../services/sessionService.js';

const DEFAULT_JWT = 'crm-dev-secret-change-me';
const isProduction = process.env.NODE_ENV === 'production';

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET || DEFAULT_JWT;
  if (isProduction && (!process.env.JWT_SECRET || secret === DEFAULT_JWT)) {
    throw new Error('JWT_SECRET must be set to a strong value in production');
  }
  if (!isProduction && secret === DEFAULT_JWT) {
    console.warn('[security] Using default JWT_SECRET — set JWT_SECRET before production.');
  }
  return secret;
}

export const JWT_SECRET = resolveJwtSecret();

export function signToken(user, tokenId) {
  if (!tokenId) {
    throw new Error('tokenId (jti) is required');
  }
  return jwt.sign(
    {
      userId: user._id.toString(),
      jti: tokenId,
      tv: user.tokenVersion || 0,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token', code: 'TOKEN_INVALID' });
    }

    if (!payload.jti) {
      return res.status(401).json({
        message: 'Session token is missing. Please sign in again.',
        code: 'SESSION_REVOKED',
      });
    }

    const user = await User.findById(payload.userId).populate('role');

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Invalid or inactive user', code: 'USER_INACTIVE' });
    }

    if (!user.role) {
      return res.status(401).json({ message: 'User has no role assigned', code: 'NO_ROLE' });
    }

    if ((payload.tv || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({
        message: 'Your session was ended by an administrator. Please sign in again.',
        code: 'SESSION_REVOKED',
      });
    }

    const session = await UserSession.findOne({ tokenId: payload.jti });
    if (!session || session.revokedAt) {
      return res.status(401).json({
        message: 'Your session was ended by an administrator. Please sign in again.',
        code: 'SESSION_REVOKED',
      });
    }
    touchUserSession(payload.jti).catch(() => {});
    req.sessionId = session._id;
    req.tokenId = payload.jti;

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token', code: 'TOKEN_INVALID' });
  }
}

export function requirePermission(...permissions) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) {
      return res.status(403).json({ message: 'No role assigned' });
    }

    if (role.isSystem && role.name === 'Admin') {
      return next();
    }

    const hasAll = permissions.every((p) => role.permissions.includes(p));
    if (!hasAll) {
      return res.status(403).json({ message: 'Permission denied' });
    }

    next();
  };
}
