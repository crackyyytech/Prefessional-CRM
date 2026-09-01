import mongoose from 'mongoose';

const leadFormSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, numbers, and hyphens'],
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    thankYouMessage: {
      type: String,
      trim: true,
      default: 'Thanks! We received your details and will contact you soon.',
    },
    source: {
      type: String,
      enum: ['website', 'referral', 'social', 'ads', 'import', 'form', 'manual', 'ai', 'other'],
      default: 'form',
    },
    campaign: { type: String, trim: true, default: '' },
    isActive: { type: Boolean, default: true },
    fields: {
      lastNameRequired: { type: Boolean, default: true },
      emailRequired: { type: Boolean, default: true },
      phoneRequired: { type: Boolean, default: false },
      companyEnabled: { type: Boolean, default: true },
      notesEnabled: { type: Boolean, default: true },
    },
    submissionCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('LeadForm', leadFormSchema);
