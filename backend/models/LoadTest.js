import mongoose from 'mongoose';

const timelineBucketSchema = new mongoose.Schema(
  {
    second: { type: Number, required: true },
    requests: { type: Number, default: 0 },
    errors: { type: Number, default: 0 },
    avgLatencyMs: { type: Number, default: 0 },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    totalRequests: { type: Number, default: 0 },
    successfulRequests: { type: Number, default: 0 },
    failedRequests: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
    avgLatencyMs: { type: Number, default: 0 },
    minLatencyMs: { type: Number, default: 0 },
    maxLatencyMs: { type: Number, default: 0 },
    p50LatencyMs: { type: Number, default: 0 },
    p95LatencyMs: { type: Number, default: 0 },
    p99LatencyMs: { type: Number, default: 0 },
    requestsPerSecond: { type: Number, default: 0 },
    bytesTransferred: { type: Number, default: 0 },
    methodCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    statusCodes: { type: mongoose.Schema.Types.Mixed, default: {} },
    errors: { type: mongoose.Schema.Types.Mixed, default: {} },
    aiProviderChannels: { type: Number, default: 0 },
    aiProvidersUsed: { type: [String], default: [] },
    channelCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    godMode: { type: Boolean, default: false },
    effectiveConcurrency: { type: Number, default: 0 },
    burstSize: { type: Number, default: 1 },
    timelineBucketSeconds: { type: Number, default: 1 },
    timeline: { type: [timelineBucketSchema], default: [] },
  },
  { _id: false }
);

const loadTestSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    targetUrl: { type: String, required: true, trim: true },
    method: { type: String, default: 'GET' },
    methods: { type: [String], default: ['GET'] },
    mixedMethods: { type: Boolean, default: false },
    godMode: { type: Boolean, default: false },
    durationSeconds: { type: Number, required: true, min: 5, max: 108000 },
    concurrency: { type: Number, required: true, min: 1, max: 10000 },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
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

export default mongoose.model('LoadTest', loadTestSchema);
