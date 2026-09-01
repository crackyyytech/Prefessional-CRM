import mongoose from 'mongoose';
import { ALL_PERMISSION_KEYS } from '../constants/permissions.js';

const roleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true, default: '' },
    permissions: [{
      type: String,
      enum: ALL_PERMISSION_KEYS,
    }],
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model('Role', roleSchema);
