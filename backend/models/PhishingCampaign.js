import mongoose from 'mongoose';

const templateSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    channel: { type: String, default: 'default' },
    subject: { type: String, default: '' },
    preview: { type: String, default: '' },
    body: { type: String, default: '' },
    sophistication: { type: Number, default: 0 },
  },
  { _id: false }
);

const reportSchema = new mongoose.Schema(
  {
    riskScore: { type: Number, default: 0 },
    riskGrade: { type: String, default: 'F' },
    vulnerabilityLevel: { type: String, default: 'low' },
    targetsTotal: { type: Number, default: 0 },
    emailsSent: { type: Number, default: 0 },
    emailsFailed: { type: Number, default: 0 },
    predictedOpenRate: { type: Number, default: 0 },
    predictedClickRate: { type: Number, default: 0 },
    predictedSubmitRate: { type: Number, default: 0 },
    effectivenessScore: { type: Number, default: 0 },
    templates: { type: [templateSchema], default: [] },
    domainChecks: { type: mongoose.Schema.Types.Mixed, default: {} },
    findings: { type: [mongoose.Schema.Types.Mixed], default: [] },
    godMode: { type: Boolean, default: false },
    maxPower: { type: Boolean, default: false },
    aiProviderChannels: { type: Number, default: 0 },
    aiProvidersUsed: { type: [String], default: [] },
    channelCounts: { type: mongoose.Schema.Types.Mixed, default: {} },
    summary: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const phishingCampaignSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    targetDomain: { type: String, required: true, trim: true },
    targetEmails: { type: [String], default: [] },
    campaignProfile: {
      type: String,
      enum: ['spear_phishing', 'credential_harvest', 'bec_attack', 'clone_phishing', 'whaling', 'smishing', 'apocalypse_phish'],
      default: 'spear_phishing',
    },
    godMode: { type: Boolean, default: false },
    maxPower: { type: Boolean, default: false },
    sendLive: { type: Boolean, default: false },
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

export default mongoose.model('PhishingCampaign', phishingCampaignSchema);
