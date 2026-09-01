import mongoose from 'mongoose';

const followUpSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ['email', 'whatsapp', 'sms'], required: true },
    subject: { type: String, trim: true, default: '' },
    message: { type: String, required: true, trim: true },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    toEmail: { type: String, trim: true, lowercase: true, default: '' },
    toPhone: { type: String, trim: true, default: '' },
    toName: { type: String, trim: true, default: '' },
    scheduledAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'cancelled'],
      default: 'pending',
    },
    errorMessage: { type: String, default: '' },
    sentAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

followUpSchema.index({ status: 1, scheduledAt: 1 });

export default mongoose.model('FollowUp', followUpSchema);
