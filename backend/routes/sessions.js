import express from 'express';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  listActiveSessions,
  revokeAllUserSessions,
  revokeSessionById,
} from '../services/sessionService.js';

const router = express.Router();

router.use(authenticate, requirePermission('users:manage'));

router.get('/', async (_req, res) => {
  try {
    const sessions = await listActiveSessions();
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:sessionId', async (req, res) => {
  try {
    const session = await revokeSessionById(req.params.sessionId, req.user._id);
    if (!session) {
      return res.status(404).json({ message: 'Active session not found' });
    }
    res.json({
      message: 'User logged out from this session',
      sessionId: session._id,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/revoke-user/:userId', async (req, res) => {
  try {
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Use logout for your own account' });
    }

    const result = await revokeAllUserSessions(
      req.params.userId,
      req.user._id,
      'Force logout by administrator'
    );

    res.json({
      message: `Logged out user from ${result.sessionsRevoked} active session(s)`,
      sessionsRevoked: result.sessionsRevoked,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
