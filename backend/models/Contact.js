import mongoose from 'mongoose';

export const LEAD_SOURCES = [
  'website',
  'referral',
  'social',
  'ads',
  'import',
  'form',
  'manual',
  'ai',
  'other',
];

const contactSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    phoneNormalized: { type: String, trim: true, default: '', index: true },
    company: { type: String, trim: true },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    area: { type: String, trim: true, default: '' },
    timezone: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['lead', 'prospect', 'customer', 'inactive'],
      default: 'lead',
    },
    notes: { type: String, trim: true },
    source: {
      type: String,
      enum: LEAD_SOURCES,
      default: 'manual',
    },
    campaign: { type: String, trim: true, default: '' },
    utmSource: { type: String, trim: true, default: '' },
    utmMedium: { type: String, trim: true, default: '' },
    utmCampaign: { type: String, trim: true, default: '' },
    formSlug: { type: String, trim: true, lowercase: true, default: '' },
    capturedAt: { type: Date },
    leadScore: { type: Number, default: 0, min: 0, max: 100 },
    leadScoreLabel: {
      type: String,
      enum: ['Hot', 'Warm', 'Cool', 'Cold'],
      default: 'Cold',
    },
    leadScoredAt: { type: Date },
    needType: {
      type: String,
      enum: ['', 'website', 'software', 'application'],
      default: '',
    },
    category: { type: String, trim: true, default: '' },
    hasWebsite: { type: Boolean },
    websiteStatus: {
      type: String,
      enum: ['', 'none', 'outdated', 'basic', 'active'],
      default: '',
    },
    website: { type: String, trim: true, default: '' },
    marketingChannels: [{ type: String, trim: true }],
    socialFacebook: { type: String, trim: true, default: '' },
    socialInstagram: { type: String, trim: true, default: '' },
    whatsappBusiness: { type: Boolean, default: false },
    digitalPresence: { type: String, trim: true, default: '' },
    currentTools: { type: String, trim: true, default: '' },
    dataCompleteness: { type: Number, default: 0, min: 0, max: 100 },
    isOriginal: { type: Boolean, default: true },

    // SMS consent / compliance
    smsOptIn: { type: Boolean, default: false },
    smsOptInAt: { type: Date, default: null },
    smsConsentType: {
      type: String,
      enum: ['', 'transactional', 'informational', 'marketing'],
      default: '',
    },
    smsConsentMethod: {
      type: String,
      enum: ['', 'web_form', 'manual', 'verbal', 'import', 'api'],
      default: '',
    },
    smsConsentSource: { type: String, trim: true, default: '' },
    smsOptedOut: { type: Boolean, default: false },
    smsOptedOutAt: { type: Date, default: null },
    smsOptOutKeyword: { type: String, default: '' },
  },
  { timestamps: true }
);

contactSchema.index({ status: 1, source: 1, leadScore: -1 });
contactSchema.index({ email: 1 }, { sparse: true });
contactSchema.index({ phoneNormalized: 1 }, { sparse: true });
contactSchema.index({ leadScore: -1 });
contactSchema.index({ status: 1, dataCompleteness: -1, leadScore: -1 });
contactSchema.index({ smsOptIn: 1, smsOptedOut: 1, phoneNormalized: 1 });

export default mongoose.model('Contact', contactSchema);
