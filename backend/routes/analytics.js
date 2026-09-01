import express from 'express';
import Contact from '../models/Contact.js';
import Deal from '../models/Deal.js';
import Task from '../models/Task.js';
import FollowUp from '../models/FollowUp.js';
import AlertSmsLog from '../models/AlertSmsLog.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { refreshAllLeadScores } from '../services/leadScoring.js';

const router = express.Router();

router.use(authenticate);

router.get('/', requirePermission('analytics:view'), async (_req, res) => {
  try {
    const now = new Date();
    const monthKeys = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-US', { month: 'short' }),
        year: d.getFullYear(),
        month: d.getMonth(),
      });
    }
    const oldest = new Date(monthKeys[0].year, monthKeys[0].month, 1);

    const [
      contactsCount,
      dealsCount,
      tasksCount,
      followUpsCount,
      dealStats,
      scoreBandsAgg,
      avgLeadScoreAgg,
      monthlyCreated,
      monthlyWon,
      followUpStatsAgg,
      topLeads,
      smsStats,
    ] = await Promise.all([
      Contact.countDocuments(),
      Deal.countDocuments(),
      Task.countDocuments(),
      FollowUp.countDocuments(),
      Deal.aggregate([
        {
          $group: {
            _id: '$stage',
            count: { $sum: 1 },
            value: { $sum: { $ifNull: ['$value', 0] } },
          },
        },
      ]),
      Contact.aggregate([
        { $group: { _id: { $ifNull: ['$leadScoreLabel', 'Cold'] }, count: { $sum: 1 } } },
      ]),
      Contact.aggregate([
        { $group: { _id: null, avg: { $avg: { $ifNull: ['$leadScore', 0] } } } },
      ]),
      Deal.aggregate([
        { $match: { createdAt: { $gte: oldest } } },
        {
          $group: {
            _id: {
              y: { $year: '$createdAt' },
              m: { $month: '$createdAt' },
            },
            created: { $sum: 1 },
          },
        },
      ]),
      Deal.aggregate([
        { $match: { stage: 'won', updatedAt: { $gte: oldest } } },
        {
          $group: {
            _id: {
              y: { $year: '$updatedAt' },
              m: { $month: '$updatedAt' },
            },
            won: { $sum: { $ifNull: ['$value', 0] } },
          },
        },
      ]),
      FollowUp.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Contact.find()
        .sort({ leadScore: -1 })
        .limit(8)
        .select('firstName lastName company status leadScore leadScoreLabel email phone')
        .lean(),
      AlertSmsLog.aggregate([
        { $match: { deletedAt: null, createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            segments: { $sum: { $ifNull: ['$totalSegments', 0] } },
            price: { $sum: { $ifNull: ['$totalPrice', 0] } },
          },
        },
      ]),
    ]);

    const dealsByStage = {};
    let wonValue = 0;
    let pipelineValue = 0;
    let wonCount = 0;
    for (const row of dealStats) {
      dealsByStage[row._id] = row.count;
      if (row._id === 'won') {
        wonValue += row.value;
        wonCount += row.count;
      } else if (row._id !== 'lost') {
        pipelineValue += row.value;
      }
    }

    const scoreBands = { Hot: 0, Warm: 0, Cool: 0, Cold: 0 };
    for (const row of scoreBandsAgg) {
      scoreBands[row._id] = row.count;
    }

    const monthly = monthKeys.map((m) => {
      const createdRow = monthlyCreated.find((r) => r._id.y === m.year && r._id.m === m.month + 1);
      const wonRow = monthlyWon.find((r) => r._id.y === m.year && r._id.m === m.month + 1);
      return {
        key: m.key,
        label: m.label,
        created: createdRow?.created || 0,
        won: wonRow?.won || 0,
      };
    });

    const followUpStats = { pending: 0, sent: 0, failed: 0, cancelled: 0 };
    for (const row of followUpStatsAgg) {
      followUpStats[row._id] = row.count;
    }

    const sms = {
      queued: 0,
      sent: 0,
      delivered: 0,
      failed: 0,
      partial: 0,
      scheduled: 0,
      segments: 0,
      price: 0,
    };
    for (const row of smsStats) {
      if (sms[row._id] != null) sms[row._id] = row.count;
      sms.segments += row.segments || 0;
      sms.price += row.price || 0;
    }
    const smsTotal = sms.queued + sms.sent + sms.delivered + sms.failed + sms.partial;
    sms.deliveryRate = smsTotal
      ? Math.round((sms.delivered / smsTotal) * 100)
      : 0;

    res.set('Cache-Control', 'private, max-age=20');
    res.json({
      totals: {
        contacts: contactsCount,
        deals: dealsCount,
        tasks: tasksCount,
        followUps: followUpsCount,
        wonValue,
        pipelineValue,
        conversionRate: dealsCount ? Math.round((wonCount / dealsCount) * 100) : 0,
        avgLeadScore: Math.round(avgLeadScoreAgg[0]?.avg || 0),
      },
      monthly,
      dealsByStage,
      scoreBands,
      topLeads,
      followUpStats,
      sms,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/refresh-scores', requirePermission('analytics:view'), async (_req, res) => {
  try {
    const count = await refreshAllLeadScores();
    res.json({ message: `Lead scores refreshed for ${count} contacts`, count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
