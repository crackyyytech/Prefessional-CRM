import mongoose from 'mongoose';

const resumeDraftSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: 'Untitled Resume' },
    targetRole: { type: String, trim: true, default: '' },
    resumeData: { type: mongoose.Schema.Types.Mixed, default: {} },
    resumeText: { type: String, default: '' },
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
    optimizationNotes: [{ type: String }],
    keywordAdditions: [{ type: String }],
    lastOptimizedAt: { type: Date },
    status: { type: String, enum: ['draft', 'analyzed', 'optimized'], default: 'draft' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

resumeDraftSchema.index({ createdBy: 1, updatedAt: -1 });

export default mongoose.model('ResumeDraft', resumeDraftSchema);
