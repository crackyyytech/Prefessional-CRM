import express from 'express';
import Task from '../models/Task.js';
import { authenticate, requirePermission } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);

router.get('/', requirePermission('tasks:view'), async (_req, res) => {
  try {
    const tasks = await Task.find()
      .populate('contact', 'firstName lastName')
      .populate('deal', 'title')
      .sort({ dueDate: 1, updatedAt: -1 });
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('tasks:view'), async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('contact', 'firstName lastName')
      .populate('deal', 'title');
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json(task);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('tasks:create'), async (req, res) => {
  try {
    const task = await Task.create(req.body);
    await task.populate('contact', 'firstName lastName');
    await task.populate('deal', 'title');
    res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/:id', requirePermission('tasks:update'), async (req, res) => {
  try {
    const task = await Task.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    })
      .populate('contact', 'firstName lastName')
      .populate('deal', 'title');
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json(task);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('tasks:delete'), async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
