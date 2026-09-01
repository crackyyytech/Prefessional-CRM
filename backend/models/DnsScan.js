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

const reportSchema = new mongoose.Schema(
  {
    domain: { type: String, default: '' },
    securityScore: { type: Number, default: 0, min: 0, max: 100 },
    grade: { type: String, default: 'F' },
    checks: {
      mxRecords: { type: [String], default: [] },
      hasSpf: { type: Boolean, default: false },
      hasDmarc: { type: Boolean, default: false },
      hasDkim: { type: Boolean, default: false },
      spfRecord: { type: String, default: '' },
      dmarcRecord: { type: String, default: '' },
      dkimHint: { type: String, default: '' },
      dmarcPolicy: { type: String, default: '' },
      spfSoftFail: { type: Boolean, default: false },
    },
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

const dnsScanSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    targetDomain: { type: String, required: true, trim: true },
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

export default mongoose.model('DnsScan', dnsScanSchema);
