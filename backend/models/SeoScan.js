import mongoose from 'mongoose';

const seoScanSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    targetUrl: { type: String, required: true, trim: true },
    finalUrl: { type: String, trim: true, default: '' },
    targetKeyword: { type: String, trim: true, default: '' },
    overallScore: { type: Number, default: 0, min: 0, max: 100 },
    ruleScore: { type: Number, default: 0 },
    aiScore: { type: Number },
    grade: { type: String, default: 'F' },
    seoRank: { type: String, default: 'Poor' },
    verdict: { type: String, default: '' },
    categories: { type: mongoose.Schema.Types.Mixed, default: [] },
    criticalIssues: [{ type: String }],
    recommendations: [{ type: String }],
    checks: { type: mongoose.Schema.Types.Mixed, default: {} },
    robotsTxt: { type: mongoose.Schema.Types.Mixed, default: null },
    aiAnalysis: { type: mongoose.Schema.Types.Mixed, default: null },
    scanMode: { type: String, default: 'deep-rules' },
    status: { type: String, enum: ['completed', 'failed'], default: 'completed' },
    errorMessage: { type: String, default: '' },
    scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

seoScanSchema.index({ scannedBy: 1, createdAt: -1 });
seoScanSchema.index({ overallScore: -1 });

export default mongoose.model('SeoScan', seoScanSchema);
