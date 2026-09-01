import mongoose from 'mongoose';

const timelineBucketSchema = new mongoose.Schema(
  {
    second: { type: Number, required: true },
    packets: { type: Number, default: 0 },
    errors: { type: Number, default: 0 },
    avgLatencyMs: { type: Number, default: 0 },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    totalPackets: { type: Number, default: 0 },
    successfulPackets: { type: Number, default: 0 },
    failedPackets: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
    packetsPerSecond: { type: Number, default: 0 },
    peakPacketsPerSecond: { type: Number, default: 0 },
    peakInFlight: { type: Number, default: 0 },
    avgLatencyMs: { type: Number, default: 0 },
    jamScore: { type: Number, default: 0 },
    jamGrade: { type: String, default: 'F' },
    cameraDisrupted: { type: Boolean, default: false },
    cameraDegraded: { type: Boolean, default: false },
    portCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    packetTypes: { type: mongoose.Schema.Types.Mixed, default: {} },
    errorTypes: { type: mongoose.Schema.Types.Mixed, default: {} },
    channelCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    portsTargeted: { type: [Number], default: [] },
    burstSize: { type: Number, default: 1 },
    pipelineDepth: { type: Number, default: 1 },
    maxPower: { type: Boolean, default: false },
    godMode: { type: Boolean, default: false },
    aiProviderChannels: { type: Number, default: 0 },
    aiProvidersUsed: { type: [String], default: [] },
    effectiveConcurrency: { type: Number, default: 0 },
    timelineBucketSeconds: { type: Number, default: 1 },
    timeline: { type: [timelineBucketSchema], default: [] },
  },
  { _id: false }
);

const cameraJamSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    targetHost: { type: String, required: true, trim: true },
    jamProfile: {
      type: String,
      enum: ['rtsp_flood', 'http_admin_jam', 'onvif_swarm', 'hikvision_jam', 'dahua_jam', 'multi_port_swarm', 'apocalypse_jam'],
      default: 'rtsp_flood',
    },
    godMode: { type: Boolean, default: false },
    maxPower: { type: Boolean, default: false },
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
    cameraIntel: { type: mongoose.Schema.Types.Mixed, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('CameraJam', cameraJamSchema);
