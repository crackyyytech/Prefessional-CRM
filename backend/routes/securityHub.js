import express from 'express';
import SecurityScan from '../models/SecurityScan.js';
import PortScan from '../models/PortScan.js';
import DnsScan from '../models/DnsScan.js';
import LoadTest from '../models/LoadTest.js';
import DdosTest from '../models/DdosTest.js';
import PhishingCampaign from '../models/PhishingCampaign.js';
import CameraJam from '../models/CameraJam.js';
import NetworkScan from '../models/NetworkScan.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

const MODULES = [
  {
    id: 'web-security',
    label: 'Web Security',
    route: '/security-analytics',
    permission: 'security:view',
    model: SecurityScan,
    scoreField: 'report.securityScore',
    targetField: 'targetUrl',
  },
  {
    id: 'dns-security',
    label: 'DNS Security',
    route: '/dns-security',
    permission: 'dnssec:view',
    model: DnsScan,
    scoreField: 'report.securityScore',
    targetField: 'targetDomain',
  },
  {
    id: 'port-scan',
    label: 'Port Scan',
    route: '/port-scan',
    permission: 'portscan:view',
    model: PortScan,
    scoreField: 'report.securityScore',
    targetField: 'targetHost',
  },
  {
    id: 'network-devices',
    label: 'Network Devices',
    route: '/network-devices',
    permission: 'network:view',
    model: NetworkScan,
    scoreField: null,
    targetField: 'subnet',
  },
  {
    id: 'load-test',
    label: 'Load Testing',
    route: '/load-testing',
    permission: 'loadtest:view',
    model: LoadTest,
    scoreField: null,
    targetField: 'targetUrl',
  },
  {
    id: 'ddos',
    label: 'DDoS Simulation',
    route: '/ddos-attack',
    permission: 'ddos:view',
    model: DdosTest,
    scoreField: null,
    targetField: 'targetUrl',
  },
  {
    id: 'phishing',
    label: 'Phishing Simulation',
    route: '/phishing-attack',
    permission: 'phishing:view',
    model: PhishingCampaign,
    scoreField: 'report.riskScore',
    targetField: 'targetDomain',
    invertScore: true,
  },
  {
    id: 'camera-jam',
    label: 'Camera IP Jam',
    route: '/camera-jam',
    permission: 'camjam:view',
    model: CameraJam,
    scoreField: null,
    targetField: 'targetHost',
  },
];

async function moduleStats(mod) {
  const [count, latest] = await Promise.all([
    mod.model.countDocuments({ status: 'completed' }),
    mod.model.findOne({ status: 'completed' }).sort({ createdAt: -1 }).lean(),
  ]);

  let lastScore = null;
  if (latest && mod.scoreField) {
    const parts = mod.scoreField.split('.');
    let val = latest;
    for (const p of parts) val = val?.[p];
    if (typeof val === 'number') {
      lastScore = mod.invertScore ? Math.max(0, 100 - val) : val;
    }
  }

  return {
    id: mod.id,
    label: mod.label,
    route: mod.route,
    permission: mod.permission,
    completedCount: count,
    lastScore,
    lastTarget: latest?.[mod.targetField] || null,
    lastAt: latest?.createdAt || null,
    lastStatus: latest?.status || null,
  };
}

function userCanView(user, permission) {
  const role = user.role;
  if (role?.isSystem && role?.name === 'Admin') return true;
  return role?.permissions?.includes(permission);
}

router.get('/overview', requirePermission('sechub:view'), async (req, res) => {
  try {
    const visible = MODULES.filter((m) => userCanView(req.user, m.permission));

    const modules = await Promise.all(visible.map((m) => moduleStats(m)));

    const scored = modules.filter((m) => m.lastScore != null);
    const avgScore = scored.length
      ? Math.round(scored.reduce((s, m) => s + m.lastScore, 0) / scored.length)
      : null;

    const recentActivity = [];
    for (const mod of visible) {
      const items = await mod.model.find()
        .sort({ createdAt: -1 })
        .limit(3)
        .select(`${mod.targetField} status createdAt report.securityScore report.riskScore name`)
        .lean();
      for (const item of items) {
        let score = item.report?.securityScore ?? null;
        if (mod.invertScore && item.report?.riskScore != null) {
          score = Math.max(0, 100 - item.report.riskScore);
        }
        recentActivity.push({
          moduleId: mod.id,
          moduleLabel: mod.label,
          route: mod.route,
          name: item.name || mod.label,
          target: item[mod.targetField],
          status: item.status,
          score,
          createdAt: item.createdAt,
        });
      }
    }
    recentActivity.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({
      modules,
      totals: {
        modules: modules.length,
        completedScans: modules.reduce((s, m) => s + m.completedCount, 0),
        avgScore,
      },
      recentActivity: recentActivity.slice(0, 12),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
