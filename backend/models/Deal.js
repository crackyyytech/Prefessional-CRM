import mongoose from 'mongoose';

const dealSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    value: { type: Number, default: 0, min: 0 },
    stage: {
      type: String,
      enum: ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'],
      default: 'lead',
    },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    expectedCloseDate: { type: Date },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

dealSchema.index({ stage: 1 });
dealSchema.index({ stage: 1, value: 1 });
dealSchema.index({ contact: 1 });
dealSchema.index({ updatedAt: -1 });

export default mongoose.model('Deal', dealSchema);
