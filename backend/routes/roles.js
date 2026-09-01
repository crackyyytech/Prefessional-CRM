import express from 'express';
import Role from '../models/Role.js';
import User from '../models/User.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { ALL_PERMISSION_KEYS, PERMISSIONS } from '../constants/permissions.js';

const router = express.Router();

router.use(authenticate);

router.get('/permissions', requirePermission('roles:manage'), (_req, res) => {
  res.json(PERMISSIONS);
});

router.get('/', requirePermission('roles:manage'), async (_req, res) => {
  try {
    const roles = await Role.find().sort({ isSystem: -1, name: 1 });
    res.json(roles);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('roles:manage'), async (req, res) => {
  try {
    const { name, description = '', permissions = [] } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Role name is required' });
    }

    const invalid = permissions.filter((p) => !ALL_PERMISSION_KEYS.includes(p));
    if (invalid.length) {
      return res.status(400).json({ message: `Invalid permissions: ${invalid.join(', ')}` });
    }

    const role = await Role.create({
      name: name.trim(),
      description: description.trim(),
      permissions,
      isSystem: false,
    });

    res.status(201).json(role);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Role name already exists' });
    }
    res.status(400).json({ message: error.message });
  }
});

router.put('/:id', requirePermission('roles:manage'), async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ message: 'Role not found' });

    if (role.isSystem) {
      return res.status(400).json({ message: 'System Admin role cannot be modified' });
    }

    const { name, description, permissions } = req.body;

    if (name !== undefined) role.name = name.trim();
    if (description !== undefined) role.description = description.trim();
    if (permissions !== undefined) {
      const invalid = permissions.filter((p) => !ALL_PERMISSION_KEYS.includes(p));
      if (invalid.length) {
        return res.status(400).json({ message: `Invalid permissions: ${invalid.join(', ')}` });
      }
      role.permissions = permissions;
    }

    await role.save();
    res.json(role);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Role name already exists' });
    }
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('roles:manage'), async (req, res) => {
  try {
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ message: 'Role not found' });

    if (role.isSystem) {
      return res.status(400).json({ message: 'System Admin role cannot be deleted' });
    }

    const usersWithRole = await User.countDocuments({ role: role._id });
    if (usersWithRole > 0) {
      return res.status(400).json({
        message: `Cannot delete role assigned to ${usersWithRole} user(s). Reassign them first.`,
      });
    }

    await role.deleteOne();
    res.json({ message: 'Role deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
