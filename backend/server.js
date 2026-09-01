import 'dotenv/config';
import dns from 'dns';
import zlib from 'zlib';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import contactRoutes from './routes/contacts.js';
import dealRoutes from './routes/deals.js';
import taskRoutes from './routes/tasks.js';
import dashboardRoutes from './routes/dashboard.js';
import authRoutes from './routes/auth.js';
import roleRoutes from './routes/roles.js';
import userRoutes from './routes/users.js';
import sessionRoutes from './routes/sessions.js';
import documentRoutes from './routes/documents.js';
import settingsRoutes from './routes/settings.js';
import aiRoutes from './routes/ai.js';
import internshipRoutes from './routes/internships.js';
import automationRoutes from './routes/automation.js';
import analyticsRoutes from './routes/analytics.js';
import integrationsRoutes from './routes/integrations.js';
import leadRoutes from './routes/leads.js';
import publicLeadRoutes from './routes/publicLeads.js';
import quotationRoutes from './routes/quotations.js';
import loadTestRoutes from './routes/loadTests.js';
import securityScanRoutes from './routes/securityScans.js';
import ddosTestRoutes from './routes/ddosTests.js';
import phishingCampaignRoutes from './routes/phishingCampaigns.js';
import portScanRoutes from './routes/portScans.js';
import dnsScanRoutes from './routes/dnsScans.js';
import securityHubRoutes from './routes/securityHub.js';
import cameraJamRoutes from './routes/cameraJamTests.js';
import jobRoutes from './routes/jobs.js';
import atsRoutes from './routes/ats.js';
import resumeBuilderRoutes from './routes/resumeBuilder.js';
import seoRoutes from './routes/seo.js';
import alertSmsRoutes from './routes/alertSms.js';
import aiImageRoutes from './routes/aiImage.js';
import aiCodeRoutes from './routes/aiCode.js';
import networkScanRoutes from './routes/networkScans.js';
import twilioWebhookRoutes from './routes/twilioWebhooks.js';
import { seedAdmin } from './seed.js';
import { repairAndPersistAiProviders } from './models/AppSettings.js';
import { startFollowUpWorker } from './services/messaging.js';
import { refreshAllLeadScores } from './services/leadScoring.js';
import LeadForm from './models/LeadForm.js';
import { probeLimiter, publicFormLimiter, aiLimiter } from './middleware/rateLimits.js';

dns.setServers(['8.8.8.8', '1.1.1.1']);
dns.setDefaultResultOrder('ipv4first');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/crm';
const isAtlas = MONGODB_URI.includes('mongodb+srv://') || MONGODB_URI.includes('mongodb.net');
const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = String(process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || !isProduction) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Twilio webhooks need urlencoded body for signature validation
app.use('/api/webhooks/twilio', express.urlencoded({ extended: false }));
app.use('/api/webhooks/twilio', twilioWebhookRoutes);

app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  const accept = req.headers['accept-encoding'] || '';
  if (!accept.includes('gzip')) return next();

  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  res.json = (body) => {
    const payload = Buffer.from(JSON.stringify(body));
    if (payload.length < 1024) return originalJson(body);
    zlib.gzip(payload, (err, compressed) => {
      if (err) return originalJson(body);
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Vary', 'Accept-Encoding');
      res.end(compressed);
    });
  };

  res.send = (body) => {
    if (typeof body === 'string' && body.length >= 1024 && !res.getHeader('Content-Encoding')) {
      zlib.gzip(Buffer.from(body), (err, compressed) => {
        if (err) return originalSend(body);
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        res.end(compressed);
      });
      return res;
    }
    return originalSend(body);
  };

  next();
});

app.get('/api/health', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'ok', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
});

app.get('/api/ping', probeLimiter, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ t: Date.now() });
});

const SPEED_PROBE_BYTES = 64 * 1024;
const SPEED_PROBE_BUFFER = Buffer.alloc(SPEED_PROBE_BYTES, 0x61);

app.get('/api/speed-probe', probeLimiter, (_req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(SPEED_PROBE_BYTES),
    'X-Probe-Bytes': String(SPEED_PROBE_BYTES),
  });
  res.end(SPEED_PROBE_BUFFER);
});

app.use('/api/auth', authRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiLimiter, aiRoutes);
app.use('/api/internships', internshipRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/public', publicFormLimiter, publicLeadRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/ats', atsRoutes);
app.use('/api/resume-builder', resumeBuilderRoutes);
app.use('/api/seo', seoRoutes);
app.use('/api/alert-sms', alertSmsRoutes);
app.use('/api/ai-image', aiImageRoutes);
app.use('/api/ai-code', aiCodeRoutes);
app.use('/api/network-scans', networkScanRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/load-tests', loadTestRoutes);
app.use('/api/security-scans', securityScanRoutes);
app.use('/api/ddos-tests', ddosTestRoutes);
app.use('/api/phishing-campaigns', phishingCampaignRoutes);
app.use('/api/port-scans', portScanRoutes);
app.use('/api/dns-scans', dnsScanRoutes);
app.use('/api/security-hub', securityHubRoutes);
app.use('/api/camera-jam', cameraJamRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/dashboard', dashboardRoutes);

async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: isAtlas ? 12000 : 3000,
      family: 4,
    });
    console.log(isAtlas ? 'Connected to MongoDB Atlas' : 'Connected to MongoDB');
    return;
  } catch (error) {
    if (isProduction) {
      throw new Error(`MongoDB unavailable in production: ${error.message}`);
    }
    console.warn(
      `${isAtlas ? 'MongoDB Atlas' : 'Local MongoDB'} unavailable (${error.message}). ` +
        'Starting in-memory MongoDB for local use...'
    );
  }

  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const memoryServer = await MongoMemoryServer.create();
  const memoryUri = memoryServer.getUri('crm');
  await mongoose.connect(memoryUri);
  console.log('Connected to in-memory MongoDB');
}

async function start() {
  try {
    await connectDatabase();
    await seedAdmin();
    const aiRepair = await repairAndPersistAiProviders();
    if (aiRepair.changed) {
      console.log('[ai] Repaired deprecated provider models in database');
    }
    const formCount = await LeadForm.countDocuments();
    if (formCount === 0) {
      await LeadForm.create({
        name: 'Website Contact',
        slug: 'website',
        title: 'Get in touch',
        description: 'Share your details and our team will reach out shortly.',
        source: 'website',
        campaign: 'website-default',
      });
      console.log('Created default lead capture form: /f/website');
    }
    refreshAllLeadScores().catch((err) => console.warn('Lead score refresh:', err.message));
    startFollowUpWorker();

    app.listen(PORT, () => {
      console.log(`Vistawin CRM API running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

start();
