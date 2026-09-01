import mongoose from 'mongoose';

const atsScanSchema = new mongoose.Schema(
  {
    fileName: { type: String, trim: true, default: '' },
    fileType: { type: String, trim: true, default: '' },
    fileSize: { type: Number, default: 0 },
    targetRole: { type: String, trim: true, default: '' },
    jobDescription: { type: String, trim: true, default: '' },
    wordCount: { type: Number, default: 0 },
    overallScore: { type: Number, default: 0, min: 0, max: 100 },
    ruleScore: { type: Number, default: 0 },
    aiScore: { type: Number },
    grade: { type: String, default: 'F' },
    verdict: { type: String, default: '' },
    atsPassProbability: { type: String, default: '' },
    fresherOrExperienced: { type: String, default: 'unknown' },
    categories: { type: mongoose.Schema.Types.Mixed, default: [] },
    criticalIssues: [{ type: String }],
    recommendations: [{ type: String }],
    keywordsFound: [{ type: String }],
    keywordsMissing: [{ type: String }],
    strengths: [{ type: String }],
    aiAnalysis: { type: mongoose.Schema.Types.Mixed, default: null },
    scanMode: { type: String, default: 'strict-rules' },
    scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

atsScanSchema.index({ scannedBy: 1, createdAt: -1 });
atsScanSchema.index({ overallScore: -1 });

export default mongoose.model('AtsScan', atsScanSchema);
