import mongoose from 'mongoose';

const aiGeneratedImageSchema = new mongoose.Schema(
  {
    prompt: { type: String, required: true, trim: true },
    originalPrompt: { type: String, default: '', trim: true },
    provider: { type: String, default: '' },
    model: { type: String, default: '' },
    style: { type: String, default: 'realistic' },
    size: { type: String, default: '1024x1024' },
    filename: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, default: 'image/png' },
    byteSize: { type: Number, default: 0 },
    fallbackUsed: { type: Boolean, default: false },
    providersTried: [{ type: String }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

aiGeneratedImageSchema.index({ createdBy: 1, createdAt: -1 });
aiGeneratedImageSchema.index({ createdAt: -1 });

export default mongoose.model('AiGeneratedImage', aiGeneratedImageSchema);
