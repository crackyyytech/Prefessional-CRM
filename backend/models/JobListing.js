import mongoose from 'mongoose';

export const EXPERIENCE_LEVELS = ['fresher', 'experienced', 'both'];
export const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship', 'remote', 'hybrid', 'other'];
export const JOB_SOURCES = ['ai', 'manual', 'import'];

const jobListingSchema = new mongoose.Schema(
  {
    jobTitle: { type: String, required: true, trim: true },
    role: { type: String, trim: true, default: '' },
    company: { type: String, trim: true, default: '' },
    location: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    area: { type: String, trim: true, default: '' },
    experienceLevel: {
      type: String,
      enum: EXPERIENCE_LEVELS,
      default: 'both',
    },
    experienceYears: { type: String, trim: true, default: '' },
    requirements: [{ type: String, trim: true }],
    skills: [{ type: String, trim: true }],
    salaryRange: { type: String, trim: true, default: '' },
    jobType: {
      type: String,
      enum: JOB_TYPES,
      default: 'full-time',
    },
    contactName: { type: String, trim: true, default: '' },
    contactEmail: { type: String, trim: true, lowercase: true, default: '' },
    contactPhone: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    applyUrl: { type: String, trim: true, default: '' },
    postedDate: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    source: {
      type: String,
      enum: JOB_SOURCES,
      default: 'manual',
    },
    searchQuery: { type: String, trim: true, default: '' },
    dataCompleteness: { type: Number, default: 0, min: 0, max: 100 },
    isVerified: { type: Boolean, default: true },
    savedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

jobListingSchema.index({ experienceLevel: 1, city: 1, role: 1 });
jobListingSchema.index({ company: 1, jobTitle: 1 });

export default mongoose.model('JobListing', jobListingSchema);
