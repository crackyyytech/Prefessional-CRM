import Role from './models/Role.js';
import User from './models/User.js';
import { ALL_PERMISSION_KEYS } from './constants/permissions.js';

const SALES_PERMISSIONS = [
  'dashboard:view',
  'contacts:view', 'contacts:create', 'contacts:update',
  'deals:view', 'deals:create', 'deals:update',
  'quotations:view', 'quotations:create', 'quotations:update', 'quotations:delete',
  'tasks:view', 'tasks:create', 'tasks:update',
  'documents:view', 'documents:create', 'documents:delete',
  'ai:chat',
  'aiimage:view', 'aiimage:generate',
  'aicode:view', 'aicode:run',
  'internships:view', 'internships:create', 'internships:update',
  'automation:view', 'automation:manage',
  'analytics:view',
  'leads:view', 'leads:manage', 'leads:import',
  'jobs:view', 'jobs:manage',
  'ats:view', 'ats:scan',
  'resumebuilder:view', 'resumebuilder:build',
  'seo:view', 'seo:scan',
  'alertsms:view',
];

export async function seedAdmin() {
  const isProduction = process.env.NODE_ENV === 'production';

  let adminRole = await Role.findOne({ name: 'Admin' });

  if (!adminRole) {
    adminRole = await Role.create({
      name: 'Admin',
      description: 'Full system access. Can create roles and manage permissions.',
      permissions: ALL_PERMISSION_KEYS,
      isSystem: true,
    });
    console.log('Created Admin role');
  } else {
    adminRole.permissions = ALL_PERMISSION_KEYS;
    adminRole.isSystem = true;
    await adminRole.save();
  }

  let salesRole = await Role.findOne({ name: 'Sales' });
  if (!salesRole) {
    await Role.create({
      name: 'Sales',
      description: 'CRM operations (contacts, deals, tasks). No SMS send or security tooling.',
      permissions: SALES_PERMISSIONS,
      isSystem: false,
    });
    console.log('Created Sales role');
  } else {
    // Keep Sales narrow: remove security tooling / SMS send if previously auto-merged
    const next = SALES_PERMISSIONS.filter((p) => ALL_PERMISSION_KEYS.includes(p));
    const same =
      next.length === salesRole.permissions.length &&
      next.every((p) => salesRole.permissions.includes(p));
    if (!same) {
      salesRole.permissions = next;
      salesRole.description = 'CRM operations (contacts, deals, tasks). No SMS send or security tooling.';
      await salesRole.save();
      console.log('Updated Sales role permissions (narrowed)');
    }
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@crm.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';

  if (isProduction) {
    if (!process.env.ADMIN_PASSWORD || adminPassword === 'admin123') {
      throw new Error('ADMIN_PASSWORD must be set to a strong value in production');
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'crm-dev-secret-change-me') {
      throw new Error('JWT_SECRET must be set to a strong value in production');
    }
  }

  let adminUser = await User.findOne({ email: adminEmail });
  if (!adminUser) {
    adminUser = await User.create({
      name: 'Administrator',
      email: adminEmail,
      password: adminPassword,
      role: adminRole._id,
      isActive: true,
    });
    if (isProduction) {
      console.log(`Created admin user: ${adminEmail} (password set from ADMIN_PASSWORD)`);
    } else {
      console.log(`Created admin user: ${adminEmail} / (see ADMIN_PASSWORD or default for local)`);
    }
  }
}
