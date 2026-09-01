import express from 'express';
import User from '../models/User.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimits.js';
import { writeAudit } from '../models/AuditLog.js';
import {
  createTokenId,
  createUserSession,
  revokeAllUserSessions,
  revokeSessionByTokenId,
} from '../services/sessionService.js';

const router = express.Router();

function clientMeta(req) {
  return {
    ip: req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() || req.ip || '',
    userAgent: req.headers['user-agent'] || '',
  };
}

router.post('/login', loginLimiter, async (req, res) => {
  const meta = clientMeta(req);
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).populate('role');
    if (!user || !(await user.comparePassword(password))) {
      await writeAudit({
        action: 'auth.login_failed',
        actorEmail: String(email || '').toLowerCase(),
        success: false,
        message: 'Invalid credentials',
        ...meta,
      });
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      await writeAudit({
        action: 'auth.login_failed',
        actor: user._id,
        actorEmail: user.email,
        success: false,
        message: 'Inactive account',
        ...meta,
      });
      return res.status(401).json({ message: 'Account is inactive' });
    }

    const tokenId = createTokenId();
    await createUserSession(user._id, tokenId, req);
    const token = signToken(user, tokenId);

    await writeAudit({
      action: 'auth.login',
      actor: user._id,
      actorEmail: user.email,
      success: true,
      ...meta,
    });

    res.json({
      token,
      user: user.toSafeJSON(),
      permissions: user.role?.isSystem && user.role?.name === 'Admin'
        ? PERMISSIONS.map((p) => p.key)
        : (user.role?.permissions || []),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/logout', authenticate, async (req, res) => {
  try {
    await revokeSessionByTokenId(req.tokenId, req.user._id, 'User logged out');
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = req.user;
    res.json({
      user: user.toSafeJSON(),
      permissions: user.role?.isSystem && user.role?.name === 'Admin'
        ? PERMISSIONS.map((p) => p.key)
        : (user.role?.permissions || []),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { name, email } = req.body;

    if (name !== undefined) {
      if (!name.trim()) {
        return res.status(400).json({ message: 'Name is required' });
      }
      user.name = name.trim();
    }

    if (email !== undefined) {
      if (!email.trim()) {
        return res.status(400).json({ message: 'Email is required' });
      }
      user.email = email.toLowerCase().trim();
    }

    await user.save();
    await user.populate('role');

    res.json({
      user: user.toSafeJSON(),
      permissions: user.role?.isSystem && user.role?.name === 'Admin'
        ? PERMISSIONS.map((p) => p.key)
        : (user.role?.permissions || []),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(400).json({ message: error.message });
  }
});

router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const matches = await user.comparePassword(currentPassword);
    if (!matches) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await revokeAllUserSessions(user._id, user._id, 'Password changed by user');
    await writeAudit({
      action: 'auth.password_changed',
      actor: user._id,
      actorEmail: user.email,
      targetType: 'user',
      targetId: user._id,
      ...clientMeta(req),
    });

    res.json({ message: 'Password updated successfully. Please sign in again.' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

export default router;
