import express from 'express';
import Contact from '../models/Contact.js';
import Deal from '../models/Deal.js';
import Task from '../models/Task.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate, requirePermission('dashboard:view'));

router.get('/', async (_req, res) => {
  try {
    const [
      contactsCount,
      dealsCount,
      tasksCount,
      dealStats,
      tasksByStatusAgg,
      contactsByStatusAgg,
      upcomingTasks,
    ] = await Promise.all([
      Contact.countDocuments(),
      Deal.countDocuments(),
      Task.countDocuments(),
      Deal.aggregate([
        {
          $group: {
            _id: '$stage',
            count: { $sum: 1 },
            value: { $sum: { $ifNull: ['$value', 0] } },
          },
        },
      ]),
      Task.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Contact.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Task.find({
        status: { $ne: 'completed' },
        dueDate: { $gte: new Date() },
      })
        .select('title dueDate status contact')
        .populate('contact', 'firstName lastName')
        .sort({ dueDate: 1 })
        .limit(5)
        .lean(),
    ]);

    const dealsByStage = {};
    let pipelineValue = 0;
    let wonValue = 0;

    for (const row of dealStats) {
      const stage = row._id || 'lead';
      dealsByStage[stage] = row.count;
      if (stage === 'won') wonValue += row.value;
      else if (stage !== 'lost') pipelineValue += row.value;
    }

    const tasksByStatus = tasksByStatusAgg.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const contactsByStatus = contactsByStatusAgg.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    res.set('Cache-Control', 'private, max-age=15');
    res.json({
      totals: {
        contacts: contactsCount,
        deals: dealsCount,
        tasks: tasksCount,
        pipelineValue,
        wonValue,
      },
      dealsByStage,
      tasksByStatus,
      contactsByStatus,
      upcomingTasks,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
