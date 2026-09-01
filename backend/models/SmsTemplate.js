import mongoose from 'mongoose';

const smsTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    purpose: { type: String, default: '', trim: true },
    body: { type: String, required: true, trim: true, maxlength: 320 },
    variables: [{ type: String }],
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

smsTemplateSchema.index({ name: 1 });
smsTemplateSchema.index({ isActive: 1, updatedAt: -1 });

export default mongoose.model('SmsTemplate', smsTemplateSchema);
