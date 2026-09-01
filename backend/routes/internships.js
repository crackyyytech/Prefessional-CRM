import express from 'express';
import Internship from '../models/Internship.js';
import { INTERNSHIP_DURATIONS, INTERNSHIP_ROLES } from '../constants/internships.js';
import { authenticate, requirePermission } from '../middleware/auth.js';
import {
  addMonths,
  createCertificateId,
  generateInternshipCertificate,
  getDurationMonths,
} from '../services/certificate.js';

const router = express.Router();

router.use(authenticate);

router.get('/meta', requirePermission('internships:view'), (_req, res) => {
  res.json({
    roles: INTERNSHIP_ROLES,
    durations: INTERNSHIP_DURATIONS.map((d) => d.value),
  });
});

router.get('/', requirePermission('internships:view'), async (_req, res) => {
  try {
    const internships = await Internship.find()
      .populate('issuedBy', 'name email')
      .sort({ createdAt: -1 });
    res.json(internships);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', requirePermission('internships:create'), async (req, res) => {
  try {
    const { studentName, email, college, internshipRole, duration, startDate, notes, skills } = req.body;

    if (!studentName?.trim() || !internshipRole || !duration || !startDate) {
      return res.status(400).json({ message: 'Student name, role, duration, and start date are required' });
    }

    if (!INTERNSHIP_ROLES.includes(internshipRole)) {
      return res.status(400).json({ message: 'Invalid internship role' });
    }

    if (!INTERNSHIP_DURATIONS.some((d) => d.value === duration)) {
      return res.status(400).json({ message: 'Invalid duration' });
    }

    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) {
      return res.status(400).json({ message: 'Invalid start date' });
    }

    const endDate = addMonths(start, getDurationMonths(duration));
    let certificateId = createCertificateId();
    // Ensure unique
    while (await Internship.exists({ certificateId })) {
      certificateId = createCertificateId();
    }

    const internship = await Internship.create({
      studentName: studentName.trim(),
      email: email?.trim() || undefined,
      college: college?.trim() || '',
      internshipRole,
      duration,
      startDate: start,
      endDate,
      certificateId,
      notes: notes?.trim() || '',
      skills: Array.isArray(skills) ? skills.filter(Boolean).slice(0, 4) : [],
      issuedBy: req.user._id,
    });

    await internship.populate('issuedBy', 'name email');
    res.status(201).json(internship);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.put('/:id', requirePermission('internships:update'), async (req, res) => {
  try {
    const internship = await Internship.findById(req.params.id);
    if (!internship) return res.status(404).json({ message: 'Internship not found' });

    const { studentName, email, college, internshipRole, duration, startDate, notes, skills } = req.body;

    if (studentName !== undefined) internship.studentName = studentName.trim();
    if (email !== undefined) internship.email = email.trim();
    if (college !== undefined) internship.college = college.trim();
    if (notes !== undefined) internship.notes = notes.trim();
    if (skills !== undefined) {
      internship.skills = Array.isArray(skills) ? skills.filter(Boolean).slice(0, 4) : [];
    }

    if (internshipRole !== undefined) {
      if (!INTERNSHIP_ROLES.includes(internshipRole)) {
        return res.status(400).json({ message: 'Invalid internship role' });
      }
      internship.internshipRole = internshipRole;
    }

    if (duration !== undefined) {
      if (!INTERNSHIP_DURATIONS.some((d) => d.value === duration)) {
        return res.status(400).json({ message: 'Invalid duration' });
      }
      internship.duration = duration;
    }

    if (startDate !== undefined) {
      const start = new Date(startDate);
      if (Number.isNaN(start.getTime())) {
        return res.status(400).json({ message: 'Invalid start date' });
      }
      internship.startDate = start;
    }

    internship.endDate = addMonths(internship.startDate, getDurationMonths(internship.duration));
    await internship.save();
    await internship.populate('issuedBy', 'name email');
    res.json(internship);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

router.get('/:id/certificate', requirePermission('internships:view'), async (req, res) => {
  try {
    const internship = await Internship.findById(req.params.id);
    if (!internship) return res.status(404).json({ message: 'Internship not found' });

    const pdf = await generateInternshipCertificate(internship);
    const filename = `Vistawin-Internship-${internship.certificateId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', requirePermission('internships:delete'), async (req, res) => {
  try {
    const internship = await Internship.findByIdAndDelete(req.params.id);
    if (!internship) return res.status(404).json({ message: 'Internship not found' });
    res.json({ message: 'Internship deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
