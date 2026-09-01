import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true, trim: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorEmail: { type: String, default: '' },
    targetType: { type: String, default: '', trim: true },
    targetId: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    success: { type: Boolean, default: true },
    message: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

export default mongoose.model('AuditLog', auditLogSchema);

export async function writeAudit({
  action,
  actor = null,
  actorEmail = '',
  targetType = '',
  targetId = '',
  ip = '',
  userAgent = '',
  success = true,
  message = '',
  meta = {},
} = {}) {
  try {
    await mongoose.model('AuditLog').create({
      action,
      actor: actor || null,
      actorEmail: actorEmail || '',
      targetType,
      targetId: targetId ? String(targetId) : '',
      ip,
      userAgent: String(userAgent || '').slice(0, 400),
      success,
      message: String(message || '').slice(0, 1000),
      meta,
    });
  } catch (error) {
    console.warn('[audit]', error.message);
  }
}
