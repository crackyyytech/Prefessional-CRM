import mongoose from 'mongoose';

const findingSchema = new mongoose.Schema(
  {
    id: { type: String, default: '' },
    severity: { type: String, default: 'info' },
    title: { type: String, default: '' },
    detail: { type: String, default: '' },
    recommendation: { type: String, default: '' },
  },
  { _id: false }
);

const analysisSchema = new mongoose.Schema(
  {
    score: { type: Number, default: 100 },
    summary: { type: String, default: '' },
    findings: { type: [findingSchema], default: [] },
  },
  { _id: false }
);

const deviceSchema = new mongoose.Schema(
  {
    ip: { type: String, required: true },
    hostname: { type: String, default: '' },
    displayName: { type: String, default: '' },
    deviceType: { type: String, default: '' },
    osHint: { type: String, default: '' },
    mac: { type: String, default: '' },
    vendor: { type: String, default: '' },
    httpTitle: { type: String, default: '' },
    httpServer: { type: String, default: '' },
    httpPoweredBy: { type: String, default: '' },
    httpStatus: { type: Number, default: null },
    serviceSummary: { type: String, default: '' },
    riskLevel: { type: String, default: 'low' },
    attackUrl: { type: String, default: '' },
    latencyMs: { type: Number, default: null },
    icmpAlive: { type: Boolean, default: false },
    ttl: { type: Number, default: null },
    connectionType: { type: String, default: 'lan' },
    subnet: { type: String, default: '' },
    adapter: { type: String, default: '' },
    wifiSsid: { type: String, default: '' },
    wifiSignal: { type: String, default: '' },
    isSelf: { type: Boolean, default: false },
    isGateway: { type: Boolean, default: false },
    openPorts: [{
      port: Number,
      service: String,
      latencyMs: Number,
    }],
    analysis: { type: analysisSchema, default: () => ({}) },
    status: { type: String, default: 'online' },
  },
  { _id: false }
);

const interfaceSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    address: { type: String, default: '' },
    netmask: { type: String, default: '' },
    cidr: { type: String, default: '' },
    mac: { type: String, default: '' },
    family: { type: String, default: 'IPv4' },
    internal: { type: Boolean, default: false },
    kind: { type: String, default: 'other' },
  },
  { _id: false }
);

const wifiSchema = new mongoose.Schema(
  {
    connected: { type: Boolean, default: false },
    ssid: { type: String, default: '' },
    signal: { type: String, default: '' },
    bssid: { type: String, default: '' },
    radio: { type: String, default: '' },
    state: { type: String, default: '' },
    interface: { type: String, default: '' },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    subnet: { type: String, default: '' },
    scannedHosts: { type: Number, default: 0 },
    onlineCount: { type: Number, default: 0 },
    wifiDeviceCount: { type: Number, default: 0 },
    ethernetDeviceCount: { type: Number, default: 0 },
    durationMs: { type: Number, default: 0 },
    localInterfaces: { type: [interfaceSchema], default: [] },
    wifi: { type: wifiSchema, default: () => ({}) },
    devices: { type: [deviceSchema], default: [] },
    wifiDevices: { type: [deviceSchema], default: [] },
    ethernetDevices: { type: [deviceSchema], default: [] },
  },
  { _id: false }
);

const networkScanSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    subnet: { type: String, default: '' },
    status: {
      type: String,
      enum: ['running', 'completed', 'failed'],
      default: 'running',
    },
    errorMessage: { type: String, default: '' },
    report: { type: reportSchema, default: () => ({}) },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

networkScanSchema.index({ createdAt: -1 });

export default mongoose.model('NetworkScan', networkScanSchema);
