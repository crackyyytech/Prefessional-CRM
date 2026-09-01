import mongoose from 'mongoose';

const openPortSchema = new mongoose.Schema(
  {
    port: { type: Number, required: true },
    service: { type: String, default: '' },
    risk: { type: String, enum: ['critical', 'high', 'medium', 'low'], default: 'low' },
    latencyMs: { type: Number, default: 0 },
  },
  { _id: false }
);

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

const reportSchema = new mongoose.Schema(
  {
    host: { type: String, default: '' },
    portsScanned: { type: Number, default: 0 },
    openPortCount: { type: Number, default: 0 },
    closedCount: { type: Number, default: 0 },
    openPorts: { type: [openPortSchema], default: [] },
    securityScore: { type: Number, default: 0, min: 0, max: 100 },
    grade: { type: String, default: 'F' },
    findings: { type: [findingSchema], default: [] },
    summary: {
      critical: { type: Number, default: 0 },
      high: { type: Number, default: 0 },
      medium: { type: Number, default: 0 },
      low: { type: Number, default: 0 },
      pass: { type: Number, default: 0 },
      info: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const portScanSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    targetHost: { type: String, required: true, trim: true },
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

export default mongoose.model('PortScan', portScanSchema);
