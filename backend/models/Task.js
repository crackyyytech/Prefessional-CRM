import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    dueDate: { type: Date },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed'],
      default: 'pending',
    },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    deal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
  },
  { timestamps: true }
);

taskSchema.index({ status: 1 });
taskSchema.index({ status: 1, dueDate: 1 });
taskSchema.index({ contact: 1 });
taskSchema.index({ deal: 1 });

export default mongoose.model('Task', taskSchema);
