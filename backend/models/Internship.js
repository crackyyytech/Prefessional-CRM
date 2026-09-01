import mongoose from 'mongoose';
import { INTERNSHIP_DURATIONS, INTERNSHIP_ROLES } from '../constants/internships.js';

const internshipSchema = new mongoose.Schema(
  {
    studentName: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    college: { type: String, trim: true, default: '' },
    internshipRole: {
      type: String,
      required: true,
      enum: INTERNSHIP_ROLES,
    },
    duration: {
      type: String,
      required: true,
      enum: INTERNSHIP_DURATIONS.map((d) => d.value),
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    certificateId: { type: String, required: true, unique: true },
    issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, trim: true, default: '' },
    skills: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

export default mongoose.model('Internship', internshipSchema);
