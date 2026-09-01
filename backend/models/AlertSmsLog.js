import mongoose from 'mongoose';

const deliverySchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact', default: null },
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'undelivered', 'failed'],
      required: true,
    },
    providerMessageId: { type: String, default: '' },
    providerStatus: { type: String, default: '' },
    price: { type: String, default: null },
    priceUnit: { type: String, default: '' },
    numSegments: { type: Number, default: null },
    errorCode: { type: String, default: '' },
    error: { type: String, default: '' },
    deliveredAt: { type: Date, default: null },
  },
  { _id: false }
);

const alertSmsLogSchema = new mongoose.Schema(
  {
    phones: [{ type: String, required: true }],
    contacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Contact' }],
    message: { type: String, required: true, trim: true },
    purpose: { type: String, default: '', trim: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'SmsTemplate', default: null },
    templateName: { type: String, default: '' },
    status: {
      type: String,
      enum: ['scheduled', 'queued', 'sent', 'partial', 'delivered', 'failed', 'cancelled'],
      default: 'failed',
    },
    scheduledAt: { type: Date, default: null },
    aiDrafted: { type: Boolean, default: false },
    aiProvider: { type: String, default: '' },
    deliveries: [deliverySchema],
    errorMessage: { type: String, default: '' },
    totalSegments: { type: Number, default: 0 },
    totalPrice: { type: Number, default: 0 },
    priceUnit: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    sentAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    consentConfirmed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

alertSmsLogSchema.index({ createdBy: 1, sentAt: -1 });
alertSmsLogSchema.index({ sentAt: -1 });
alertSmsLogSchema.index({ status: 1, scheduledAt: 1 });
alertSmsLogSchema.index({ deletedAt: 1, createdAt: -1 });
alertSmsLogSchema.index({ 'deliveries.providerMessageId': 1 });

export default mongoose.model('AlertSmsLog', alertSmsLogSchema);
