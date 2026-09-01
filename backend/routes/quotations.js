import express from 'express';
import Quotation from '../models/Quotation.js';
import Contact from '../models/Contact.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import { getAppSettings, toBrandingSettings } from '../models/AppSettings.js';
import { generateQuotationPdf } from '../services/quotationPdf.js';
import { nextSequence } from '../models/Counter.js';

const router = express.Router();

router.use(authenticate);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function computeQuotationTotals(items = [], taxMode = 'cgst_sgst') {
  const normalized = (Array.isArray(items) ? items : []).map((raw) => {
    const qty = Number(raw.qty) || 0;
    const rate = Number(raw.rate) || 0;
    const gstPercent = Number(raw.gstPercent);
    const amount = round2(qty * rate);
    return {
      description: String(raw.description || '').trim(),
      itemType: ['service', 'license', 'amc', 'hosting', 'other'].includes(raw.itemType)
        ? raw.itemType
        : 'service',
      hsnSac: String(raw.hsnSac || '998314').trim(),
      qty,
      unit: ['nos', 'hours', 'days', 'months', 'years'].includes(raw.unit) ? raw.unit : 'nos',
      rate,
      gstPercent: Number.isFinite(gstPercent) ? gstPercent : 18,
      amount,
    };
  }).filter((item) => item.description);

  const subtotal = round2(normalized.reduce((sum, item) => sum + item.amount, 0));
  let cgstAmount = 0;
  let sgstAmount = 0;
  let igstAmount = 0;

  for (const item of normalized) {
    const tax = round2((item.amount * item.gstPercent) / 100);
    if (taxMode === 'igst') {
      igstAmount = round2(igstAmount + tax);
    } else {
      const half = round2(tax / 2);
      cgstAmount = round2(cgstAmount + half);
      sgstAmount = round2(sgstAmount + (tax - half));
    }
  }

  const grandTotal = round2(subtotal + cgstAmount + sgstAmount + igstAmount);
  return { items: normalized, subtotal, cgstAmount, sgstAmount, igstAmount, grandTotal };
}

async function nextQuoteNumber() {
  const year = new Date().getFullYear();
  const seq = await nextSequence(`quote-${year}`);
  return `VW-Q-${year}-${String(seq).padStart(4, '0')}`;
}

async function buildClientSnapshot(body, contactId) {
  const snap = {
    name: String(body.clientSnapshot?.name || '').trim(),
    company: String(body.clientSnapshot?.company || '').trim(),
    address: String(body.clientSnapshot?.address || '').trim(),
    phone: String(body.clientSnapshot?.phone || '').trim(),
    email: String(body.clientSnapshot?.email || '').trim(),
    gstin: String(body.clientSnapshot?.gstin || '').trim().toUpperCase(),
  };

  if (contactId) {
    const contact = await Contact.findById(contactId).lean();
    if (contact) {
      const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
      if (!snap.name) snap.name = fullName;
      if (!snap.company) snap.company = contact.company || '';
      if (!snap.address) {
        snap.address = [contact.address, contact.area, contact.city].filter(Boolean).join(', ');
      }
      if (!snap.phone) snap.phone = contact.phone || '';
      if (!snap.email) snap.email = contact.email || '';
    }
  }

  return snap;
}

function applyPopulate(doc) {
  return doc.populate([
    { path: 'contact', select: 'firstName lastName company email phone address city area' },
    { path: 'deal', select: 'title value stage' },
    { path: 'createdBy', select: 'name email' },
  ]);
}

function listQuery() {
  return Quotation.find()
    .populate('contact', 'firstName lastName company email phone address city area')
    .populate('deal', 'title value stage')
    .populate('createdBy', 'name email');
}

router.get('/', requirePermission('quotations:view'), async (_req, res) => {
  try {
    const quotations = await listQuery().sort({ updatedAt: -1 });
    res.json(quotations);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/pdf', requirePermission('quotations:view'), async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id).lean();
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

    const settings = await getAppSettings();
    const company = toBrandingSettings(settings);
    const pdf = await generateQuotationPdf(quotation, company);
    const filename = `${quotation.quoteNumber}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', requirePermission('quotations:view'), async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id)
      .populate('contact', 'firstName lastName company email phone address city area')
      .populate('deal', 'title value stage')
      .populate('createdBy', 'name email');
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
    res.json(quotation);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('quotations:create'), async (req, res) => {
  try {
    const taxMode = req.body.taxMode === 'igst' ? 'igst' : 'cgst_sgst';
    const totals = computeQuotationTotals(req.body.items, taxMode);
    if (!totals.items.length) {
      return res.status(400).json({ message: 'Add at least one line item with a description' });
    }

    const projectTitle = String(req.body.projectTitle || '').trim();
    if (!projectTitle) return res.status(400).json({ message: 'Project title is required' });

    const contactId = req.body.contact || undefined;
    const clientSnapshot = await buildClientSnapshot(req.body, contactId);
    const quoteNumber = await nextQuoteNumber();

    const quotation = await Quotation.create({
      quoteNumber,
      status: ['draft', 'sent', 'accepted', 'rejected', 'expired'].includes(req.body.status)
        ? req.body.status
        : 'draft',
      issueDate: req.body.issueDate ? new Date(req.body.issueDate) : new Date(),
      validUntil: req.body.validUntil ? new Date(req.body.validUntil) : undefined,
      contact: contactId,
      deal: req.body.deal || undefined,
      clientSnapshot,
      projectTitle,
      scopeSummary: String(req.body.scopeSummary || '').trim(),
      placeOfSupply: String(req.body.placeOfSupply || '').trim(),
      taxMode,
      ...totals,
      paymentTerms: String(req.body.paymentTerms || '').trim()
        || '50% advance on acceptance; 50% on delivery / go-live.',
      termsAndConditions: String(req.body.termsAndConditions || '').trim()
        || undefined,
      notes: String(req.body.notes || '').trim(),
      createdBy: req.user._id,
    });

    await applyPopulate(quotation);
    res.status(201).json(quotation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/:id', requirePermission('quotations:update'), async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });

    const taxMode = req.body.taxMode === 'igst' ? 'igst' : (req.body.taxMode || quotation.taxMode);
    const mode = taxMode === 'igst' ? 'igst' : 'cgst_sgst';
    const totals = computeQuotationTotals(req.body.items ?? quotation.items, mode);
    if (!totals.items.length) {
      return res.status(400).json({ message: 'Add at least one line item with a description' });
    }

    const projectTitle = String(req.body.projectTitle ?? quotation.projectTitle).trim();
    if (!projectTitle) return res.status(400).json({ message: 'Project title is required' });

    const contactId = req.body.contact !== undefined
      ? (req.body.contact || undefined)
      : quotation.contact;

    if (req.body.clientSnapshot || req.body.contact !== undefined) {
      quotation.clientSnapshot = await buildClientSnapshot(req.body, contactId);
    }

    if (req.body.status !== undefined) {
      if (!['draft', 'sent', 'accepted', 'rejected', 'expired'].includes(req.body.status)) {
        return res.status(400).json({ message: 'Invalid status' });
      }
      quotation.status = req.body.status;
    }
    if (req.body.issueDate !== undefined) {
      quotation.issueDate = req.body.issueDate ? new Date(req.body.issueDate) : quotation.issueDate;
    }
    if (req.body.validUntil !== undefined) {
      quotation.validUntil = req.body.validUntil ? new Date(req.body.validUntil) : undefined;
    }
    quotation.contact = contactId;
    if (req.body.deal !== undefined) quotation.deal = req.body.deal || undefined;
    quotation.projectTitle = projectTitle;
    if (req.body.scopeSummary !== undefined) quotation.scopeSummary = String(req.body.scopeSummary || '').trim();
    if (req.body.placeOfSupply !== undefined) quotation.placeOfSupply = String(req.body.placeOfSupply || '').trim();
    quotation.taxMode = mode;
    quotation.items = totals.items;
    quotation.subtotal = totals.subtotal;
    quotation.cgstAmount = totals.cgstAmount;
    quotation.sgstAmount = totals.sgstAmount;
    quotation.igstAmount = totals.igstAmount;
    quotation.grandTotal = totals.grandTotal;
    if (req.body.paymentTerms !== undefined) quotation.paymentTerms = String(req.body.paymentTerms || '').trim();
    if (req.body.termsAndConditions !== undefined) {
      quotation.termsAndConditions = String(req.body.termsAndConditions || '').trim();
    }
    if (req.body.notes !== undefined) quotation.notes = String(req.body.notes || '').trim();

    await quotation.save();
    await applyPopulate(quotation);
    res.json(quotation);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('quotations:delete'), async (req, res) => {
  try {
    const quotation = await Quotation.findByIdAndDelete(req.params.id);
    if (!quotation) return res.status(404).json({ message: 'Quotation not found' });
    res.json({ message: 'Quotation deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
