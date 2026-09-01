import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema(
  {
    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    description: { type: String, trim: true, default: '' },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    deal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.model('Document', documentSchema);
