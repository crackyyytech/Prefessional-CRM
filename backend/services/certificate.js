import PDFDocument from 'pdfkit';
import { INTERNSHIP_DURATIONS } from '../constants/internships.js';

const ROLE_SKILLS = {
  'Frontend Developer Intern': [
    'HTML5, CSS3 & responsive UI',
    'JavaScript / modern frontend frameworks',
    'Component design & user experience basics',
    'Version control and collaborative delivery',
  ],
  'Backend Developer Intern': [
    'REST API design & implementation',
    'Database modeling and queries',
    'Authentication & secure coding practices',
    'Server-side application architecture',
  ],
  'Full Stack Developer Intern': [
    'End-to-end web application development',
    'Frontend and backend integration',
    'Database and API workflow',
    'Deployment readiness and debugging',
  ],
  'UI/UX Design Intern': [
    'Wireframing and prototype design',
    'Visual hierarchy & interface consistency',
    'User research fundamentals',
    'Design collaboration with developers',
  ],
  'Digital Marketing Intern': [
    'Campaign planning and content strategy',
    'Social media and audience engagement',
    'Analytics and performance tracking',
    'Brand communication fundamentals',
  ],
  'Data Analyst Intern': [
    'Data cleaning and preparation',
    'Reporting and visualization basics',
    'Insight generation from datasets',
    'Business metrics interpretation',
  ],
  'Business Development Intern': [
    'Lead research and outreach support',
    'CRM pipeline follow-up',
    'Client communication fundamentals',
    'Market and competitor awareness',
  ],
  'Human Resources Intern': [
    'Recruitment coordination support',
    'Employee documentation handling',
    'Onboarding process assistance',
    'HR compliance awareness',
  ],
  'Content Writing Intern': [
    'Professional writing and editing',
    'Content structure and SEO basics',
    'Brand tone consistency',
    'Research-driven copy development',
  ],
  'Graphic Design Intern': [
    'Brand-aligned visual design',
    'Layout and typography fundamentals',
    'Creative asset preparation',
    'Design feedback and iteration',
  ],
};

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

export function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function getDurationMonths(durationValue) {
  return INTERNSHIP_DURATIONS.find((d) => d.value === durationValue)?.months || 1;
}

export function createCertificateId() {
  const year = new Date().getFullYear();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `VW-INT-${year}-${random}`;
}

function getSkills(internship) {
  if (Array.isArray(internship.skills) && internship.skills.length) {
    return internship.skills.slice(0, 4);
  }
  return ROLE_SKILLS[internship.internshipRole] || [
    'Professional workplace conduct',
    'Team collaboration and communication',
    'Task ownership and timely delivery',
    'Continuous learning and improvement',
  ];
}

function drawCornerFlourish(doc, x, y, size, flipX, flipY) {
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  doc
    .save()
    .translate(x, y)
    .strokeColor('#c9a227')
    .lineWidth(1.5)
    .moveTo(0, size * sy)
    .lineTo(0, 0)
    .lineTo(size * sx, 0)
    .stroke()
    .moveTo(8 * sx, size * sy)
    .lineTo(8 * sx, 8 * sy)
    .lineTo(size * sx, 8 * sy)
    .stroke()
    .restore();
}

export function generateInternshipCertificate(internship) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 28, bottom: 28, left: 36, right: 36 },
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const skills = getSkills(internship);
      const college = internship.college?.trim();
      const issuedOn = formatDate(internship.createdAt || new Date());

      // Soft background tint
      doc.rect(0, 0, pageWidth, pageHeight).fill('#fbfaf6');

      // Outer navy frame
      doc
        .rect(16, 16, pageWidth - 32, pageHeight - 32)
        .lineWidth(4)
        .strokeColor('#14355c')
        .stroke();

      // Gold frame
      doc
        .rect(24, 24, pageWidth - 48, pageHeight - 48)
        .lineWidth(1.5)
        .strokeColor('#c9a227')
        .stroke();

      // Inner thin navy frame
      doc
        .rect(32, 32, pageWidth - 64, pageHeight - 64)
        .lineWidth(0.8)
        .strokeColor('#1e3a5f')
        .stroke();

      drawCornerFlourish(doc, 48, 48, 28, false, false);
      drawCornerFlourish(doc, pageWidth - 48, 48, 28, true, false);
      drawCornerFlourish(doc, 48, pageHeight - 48, 28, false, true);
      drawCornerFlourish(doc, pageWidth - 48, pageHeight - 48, 28, true, true);

      // Brand mark circle
      doc
        .circle(pageWidth / 2, 62, 16)
        .fillAndStroke('#14355c', '#c9a227');
      doc
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(14)
        .text('V', pageWidth / 2 - 5, 54, { width: 12, align: 'center' });

      doc
        .font('Helvetica-Bold')
        .fillColor('#14355c')
        .fontSize(26)
        .text('VISTAWIN', 0, 84, { align: 'center' });

      doc
        .font('Helvetica')
        .fillColor('#64748b')
        .fontSize(9)
        .text('Excellence in Technology & Professional Development', 0, 114, {
          align: 'center',
          characterSpacing: 1.2,
        });

      doc
        .font('Helvetica-Bold')
        .fillColor('#c9a227')
        .fontSize(12)
        .text('CERTIFICATE OF INTERNSHIP', 0, 134, {
          align: 'center',
          characterSpacing: 3.5,
        });

      doc
        .moveTo(pageWidth / 2 - 150, 154)
        .lineTo(pageWidth / 2 + 150, 154)
        .strokeColor('#c9a227')
        .lineWidth(1.2)
        .stroke();

      doc
        .font('Helvetica')
        .fillColor('#334155')
        .fontSize(11)
        .text('This certificate is proudly presented to', 0, 166, { align: 'center' });

      const name = String(internship.studentName || '').trim();
      doc
        .font('Times-BoldItalic')
        .fillColor('#0f172a')
        .fontSize(name.length > 28 ? 24 : 30)
        .text(name, 70, 184, {
          width: pageWidth - 140,
          align: 'center',
        });

      // Underline under name
      doc
        .moveTo(pageWidth / 2 - 160, 218)
        .lineTo(pageWidth / 2 + 160, 218)
        .strokeColor('#cbd5e1')
        .lineWidth(0.8)
        .stroke();

      let bodyY = 228;
      if (college) {
        doc
          .font('Helvetica')
          .fillColor('#475569')
          .fontSize(10)
          .text(`Student / Candidate of ${college}`, 70, bodyY, {
            width: pageWidth - 140,
            align: 'center',
          });
        bodyY += 16;
      }

      doc
        .font('Helvetica')
        .fillColor('#334155')
        .fontSize(11)
        .text(
          'for successfully completing a structured professional internship programme with Vistawin in the capacity of',
          80,
          bodyY,
          { width: pageWidth - 160, align: 'center', lineGap: 2 }
        );

      doc
        .font('Helvetica-Bold')
        .fillColor('#14355c')
        .fontSize(16)
        .text(internship.internshipRole, 70, bodyY + 30, {
          width: pageWidth - 140,
          align: 'center',
        });

      doc
        .font('Helvetica')
        .fillColor('#334155')
        .fontSize(11)
        .text(
          `Internship Duration: ${internship.duration}  |  Training Period: ${formatDate(internship.startDate)} to ${formatDate(internship.endDate)}`,
          70,
          bodyY + 54,
          { width: pageWidth - 140, align: 'center' }
        );

      const narrative = internship.notes?.trim()
        ? internship.notes.trim()
        : 'During the internship, the candidate actively participated in assigned projects, followed professional workplace standards, collaborated with the team, and demonstrated sincere commitment toward learning and contributing to organizational goals.';

      doc
        .font('Helvetica-Oblique')
        .fillColor('#475569')
        .fontSize(10)
        .text(narrative, 90, bodyY + 76, {
          width: pageWidth - 180,
          align: 'center',
          lineGap: 2,
        });

      // Skills box
      const skillsTop = bodyY + 118;
      doc
        .roundedRect(90, skillsTop, pageWidth - 180, 78, 6)
        .fillAndStroke('#ffffff', '#e2e8f0');

      doc
        .font('Helvetica-Bold')
        .fillColor('#14355c')
        .fontSize(10)
        .text('KEY COMPETENCIES DEVELOPED', 90, skillsTop + 10, {
          width: pageWidth - 180,
          align: 'center',
          characterSpacing: 1,
        });

      const colWidth = (pageWidth - 220) / 2;
      skills.slice(0, 4).forEach((skill, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const x = 110 + col * (colWidth + 20);
        const y = skillsTop + 28 + row * 18;
        doc
          .circle(x, y + 4, 2)
          .fill('#c9a227');
        doc
          .font('Helvetica')
          .fillColor('#334155')
          .fontSize(9.5)
          .text(skill, x + 10, y, { width: colWidth - 10 });
      });

      // Seal
      const sealX = pageWidth / 2;
      const sealY = pageHeight - 118;
      doc
        .circle(sealX, sealY, 28)
        .lineWidth(2)
        .strokeColor('#c9a227')
        .stroke();
      doc
        .circle(sealX, sealY, 22)
        .lineWidth(0.8)
        .strokeColor('#14355c')
        .stroke();
      doc
        .font('Helvetica-Bold')
        .fillColor('#14355c')
        .fontSize(7)
        .text('VISTAWIN', sealX - 24, sealY - 10, { width: 48, align: 'center' });
      doc
        .font('Helvetica')
        .fillColor('#c9a227')
        .fontSize(6)
        .text('OFFICIAL\nSEAL', sealX - 20, sealY + 1, { width: 40, align: 'center' });

      // Signatures
      const sigY = pageHeight - 108;
      doc
        .moveTo(70, sigY)
        .lineTo(220, sigY)
        .strokeColor('#94a3b8')
        .lineWidth(1)
        .stroke();
      doc
        .font('Helvetica-Bold')
        .fillColor('#14355c')
        .fontSize(10)
        .text('Authorized Signatory', 70, sigY + 6, { width: 150, align: 'center' });
      doc
        .font('Helvetica')
        .fillColor('#64748b')
        .fontSize(8)
        .text('Director / HR Head\nVistawin', 70, sigY + 20, { width: 150, align: 'center' });

      doc
        .moveTo(pageWidth - 220, sigY)
        .lineTo(pageWidth - 70, sigY)
        .strokeColor('#94a3b8')
        .lineWidth(1)
        .stroke();
      doc
        .font('Helvetica-Bold')
        .fillColor('#14355c')
        .fontSize(10)
        .text('Programme Mentor', pageWidth - 220, sigY + 6, { width: 150, align: 'center' });
      doc
        .font('Helvetica')
        .fillColor('#64748b')
        .fontSize(8)
        .text(`Issued on ${issuedOn}\nTraining & Development`, pageWidth - 220, sigY + 20, {
          width: 150,
          align: 'center',
        });

      doc
        .font('Helvetica')
        .fillColor('#64748b')
        .fontSize(8)
        .text(
          `Certificate ID: ${internship.certificateId}   •   This certificate is system-generated by Vistawin CRM and remains verifiable for official records.`,
          50,
          pageHeight - 42,
          { width: pageWidth - 100, align: 'center' }
        );

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
