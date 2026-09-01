import mongoose from 'mongoose';

const aiCodeWorkspaceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    prompt: { type: String, default: '', trim: true },
    provider: { type: String, default: 'auto' },
    model: { type: String, default: '' },
    rootDir: { type: String, default: '' },
    lastGeneratedAt: { type: Date },
    filesCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

aiCodeWorkspaceSchema.index({ createdBy: 1, updatedAt: -1 });

export default mongoose.model('AiCodeWorkspace', aiCodeWorkspaceSchema);
