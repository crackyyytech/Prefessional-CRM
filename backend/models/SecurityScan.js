import mongoose from 'mongoose';

const findingSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    severity: { type: String, enum: ['critical', 'high', 'medium', 'low', 'info', 'pass'], default: 'info' },
    title: { type: String, required: true },
    detail: { type: String, default: '' },
    recommendation: { type: String, default: '' },
  },
  { _id: false }
);

const headerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    value: { type: String, default: '' },
    present: { type: Boolean, default: false },
    status: { type: String, enum: ['pass', 'warn', 'fail', 'missing'], default: 'missing' },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    securityScore: { type: Number, default: 0, min: 0, max: 100 },
    grade: { type: String, default: 'F' },
    httpsEnabled: { type: Boolean, default: false },
    redirectsToHttps: { type: Boolean, default: false },
    responseStatus: { type: Number, default: 0 },
    responseTimeMs: { type: Number, default: 0 },
    serverHeader: { type: String, default: '' },
    tls: {
      valid: { type: Boolean, default: false },
      protocol: { type: String, default: '' },
      issuer: { type: String, default: '' },
      subject: { type: String, default: '' },
      validFrom: { type: String, default: '' },
      validTo: { type: String, default: '' },
      daysUntilExpiry: { type: Number, default: 0 },
      selfSigned: { type: Boolean, default: false },
    },
    headers: { type: [headerSchema], default: [] },
    cookieIssues: { type: [String], default: [] },
    findings: { type: [findingSchema], default: [] },
    summary: {
      critical: { type: Number, default: 0 },
      high: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      low: { type: Number, default: 0 },
      pass: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const securityScanSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    targetUrl: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    errorMessage: { type: String, default: '' },
    report: { type: reportSchema, default: () => ({}) },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('SecurityScan', securityScanSchema);
