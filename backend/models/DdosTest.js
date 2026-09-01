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
    errorRate: { type: Number, default: 0 },
    avgLatencyMs: { type: Number, default: 0 },
    minLatencyMs: { type: Number, default: 0 },
    maxLatencyMs: { type: Number, default: 0 },
    p95LatencyMs: { type: Number, default: 0 },
    requestsPerSecond: { type: Number, default: 0 },
    peakRequestsPerSecond: { type: Number, default: 0 },
    peakErrorRate: { type: Number, default: 0 },
    bytesTransferred: { type: Number, default: 0 },
    methodCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    statusCodes: { type: mongoose.Schema.Types.Mixed, default: {} },
    errorTypes: { type: mongoose.Schema.Types.Mixed, default: {} },
    channelCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    godMode: { type: Boolean, default: false },
    aiProviderChannels: { type: Number, default: 0 },
    aiProvidersUsed: { type: [String], default: [] },
    effectiveConcurrency: { type: Number, default: 0 },
    mixedMethods: { type: Boolean, default: false },
    methods: { type: [String], default: [] },
    resilienceScore: { type: Number, default: 0 },
    resilienceGrade: { type: String, default: 'F' },
    siteDegraded: { type: Boolean, default: false },
    siteDown: { type: Boolean, default: false },
    burstSize: { type: Number, default: 1 },
    maxPower: { type: Boolean, default: false },
    pipelineDepth: { type: Number, default: 1 },
    peakInFlight: { type: Number, default: 0 },
    theoreticalPeakRps: { type: Number, default: 0 },
    timelineBucketSeconds: { type: Number, default: 1 },
    timeline: { type: [timelineBucketSchema], default: [] },
  },
  { _id: false }
);

const ddosTestSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    targetUrl: { type: String, required: true, trim: true },
    attackProfile: {
      type: String,
      enum: ['http_flood', 'post_flood', 'mixed_vector', 'burst_wave', 'aggressive', 'apocalypse'],
      default: 'http_flood',
    },
    godMode: { type: Boolean, default: false },
    maxPower: { type: Boolean, default: false },
    mixedMethods: { type: Boolean, default: false },
    methods: { type: [String], default: [] },
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

export default mongoose.model('DdosTest', ddosTestSchema);
