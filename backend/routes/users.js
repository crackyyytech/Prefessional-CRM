import express from 'express';
import User from '../models/User.js';
import Role from '../models/Role.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { revokeAllUserSessions } from '../services/sessionService.js';

const router = express.Router();

router.use(authenticate, requirePermission('users:manage'));

router.get('/', async (_req, res) => {
  try {
    const users = await User.find().populate('role').sort({ createdAt: -1 });
    res.json(users.map((u) => u.toSafeJSON()));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, password, roleId, isActive = true } = req.body;

    if (!name?.trim() || !email?.trim() || !password || !roleId) {
      return res.status(400).json({ message: 'Name, email, password, and role are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const role = await Role.findById(roleId);
    if (!role) return res.status(400).json({ message: 'Role not found' });

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: role._id,
      isActive,
    });

    await user.populate('role');
    res.status(201).json(user.toSafeJSON());
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(400).json({ message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { name, email, password, roleId, isActive } = req.body;

    if (name !== undefined) user.name = name.trim();
    if (email !== undefined) user.email = email.toLowerCase().trim();
    if (isActive !== undefined) {
      if (user._id.equals(req.user._id) && !isActive) {
        return res.status(400).json({ message: 'You cannot deactivate your own account' });
      }
      user.isActive = isActive;
      if (!isActive) {
        await revokeAllUserSessions(user._id, req.user._id, 'Account deactivated');
      }
    }

    if (roleId !== undefined) {
      const role = await Role.findById(roleId);
      if (!role) return res.status(400).json({ message: 'Role not found' });

      if (user._id.equals(req.user._id) && !role.isSystem) {
        return res.status(400).json({ message: 'You cannot remove Admin role from yourself' });
      }

      user.role = role._id;
    }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ message: 'Password must be at least 8 characters' });
      }
      user.password = password;
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      await revokeAllUserSessions(user._id, req.user._id, 'Password changed by administrator');
    }

    await user.save();
    await user.populate('role');
    res.json(user.toSafeJSON());
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(400).json({ message: error.message });
  }
});

router.put('/:id/password', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }

    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await revokeAllUserSessions(user._id, req.user._id, 'Password changed by administrator');

    res.json({
      message: `Password updated for ${user.name}. Previous sessions were revoked.`,
      note: 'Passwords are stored encrypted and cannot be viewed after saving. Share the new password securely out of band.',
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/:id/password-info', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name email password updatedAt createdAt');
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      userId: user._id,
      name: user.name,
      email: user.email,
      passwordStatus: 'encrypted',
      passwordPreview: '••••••••',
      message: 'Passwords are one-way encrypted (bcrypt). Original password cannot be displayed. Admin can set a new password.',
      lastUpdated: user.updatedAt,
      accountCreated: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
