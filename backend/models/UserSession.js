import mongoose from 'mongoose';

const userSessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenId: { type: String, required: true, unique: true },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    loginAt: { type: Date, default: Date.now },
    lastActiveAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    revokeReason: { type: String, default: '' },
  },
  { timestamps: true }
);

userSessionSchema.index({ user: 1, revokedAt: 1, lastActiveAt: -1 });

export default mongoose.model('UserSession', userSessionSchema);
