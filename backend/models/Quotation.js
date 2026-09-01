import mongoose from 'mongoose';

const quotationItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    itemType: {
      type: String,
      enum: ['service', 'license', 'amc', 'hosting', 'other'],
      default: 'service',
    },
    hsnSac: { type: String, trim: true, default: '998314' },
    qty: { type: Number, default: 1, min: 0 },
    unit: {
      type: String,
      enum: ['nos', 'hours', 'days', 'months', 'years'],
      default: 'nos',
    },
    rate: { type: Number, default: 0, min: 0 },
    gstPercent: { type: Number, default: 18, min: 0, max: 100 },
    amount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const clientSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    company: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    gstin: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const quotationSchema = new mongoose.Schema(
  {
    quoteNumber: { type: String, required: true, unique: true, trim: true },
    status: {
      type: String,
      enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'],
      default: 'draft',
    },
    issueDate: { type: Date, default: Date.now },
    validUntil: { type: Date },
    contact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },
    deal: { type: mongoose.Schema.Types.ObjectId, ref: 'Deal' },
    clientSnapshot: { type: clientSnapshotSchema, default: () => ({}) },
    projectTitle: { type: String, required: true, trim: true },
    scopeSummary: { type: String, trim: true, default: '' },
    placeOfSupply: { type: String, trim: true, default: '' },
    taxMode: {
      type: String,
      enum: ['cgst_sgst', 'igst'],
      default: 'cgst_sgst',
    },
    items: { type: [quotationItemSchema], default: [] },
    subtotal: { type: Number, default: 0, min: 0 },
    cgstAmount: { type: Number, default: 0, min: 0 },
    sgstAmount: { type: Number, default: 0, min: 0 },
    igstAmount: { type: Number, default: 0, min: 0 },
    grandTotal: { type: Number, default: 0, min: 0 },
    paymentTerms: {
      type: String,
      trim: true,
      default: '50% advance on acceptance; 50% on delivery / go-live.',
    },
    termsAndConditions: {
      type: String,
      trim: true,
      default:
        '1. Payment as per the agreed schedule; work begins after advance clearance.\n'
        + '2. Scope changes may revise timeline and cost with written approval.\n'
        + '3. Intellectual property transfers to the client after full payment.\n'
        + '4. Free support window as specified in the scope; AMC thereafter is optional.\n'
        + '5. This quotation is valid until the stated validity date.',
    },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export default mongoose.model('Quotation', quotationSchema);
