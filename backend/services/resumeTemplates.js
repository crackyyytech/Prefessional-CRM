import { emptyResumeData, sanitizeResumeData } from './resumeBuilder.js';

const TEMPLATES = [
  {
    id: 'software-engineer',
    name: 'Software Engineer',
    category: 'Technology',
    level: 'Experienced',
    description: 'Full-stack developer with metrics-driven bullets, projects, and certifications.',
    accent: '#3b82f6',
    resumeData: {
      name: 'Arjun Mehta',
      email: 'arjun.mehta@email.com',
      phone: '+91 98765 43210',
      location: 'Bangalore, India',
      linkedin: 'linkedin.com/in/arjunmehta',
      github: 'github.com/arjunmehta',
      targetRole: 'Senior Software Engineer',
      summary: 'Results-driven Software Engineer with 5+ years building scalable web applications using React, Node.js, and cloud technologies. Proven track record of delivering high-impact features, reducing system latency by 40%, and mentoring junior developers. Strong expertise in API design, microservices, and Agile delivery.',
      experience: [
        {
          title: 'Senior Software Engineer',
          company: 'TechNova Solutions',
          location: 'Bangalore, India',
          startDate: 'Jan 2022',
          endDate: '',
          current: true,
          bullets: [
            'Led development of customer dashboard serving 12,000+ daily active users, improving engagement by 28%',
            'Architected RESTful APIs in Node.js reducing average response time from 450ms to 180ms (60% improvement)',
            'Mentored team of 4 junior engineers; established code review standards that cut production bugs by 35%',
            'Implemented CI/CD pipeline with GitHub Actions, reducing deployment time from 2 hours to 15 minutes',
          ],
        },
        {
          title: 'Software Engineer',
          company: 'Digital Labs Pvt Ltd',
          location: 'Chennai, India',
          startDate: 'Jun 2019',
          endDate: 'Dec 2021',
          current: false,
          bullets: [
            'Built React-based admin portal used by 200+ internal users across 3 departments',
            'Optimized PostgreSQL queries and indexing strategy, improving report generation speed by 45%',
            'Collaborated with product and QA teams in Agile sprints; delivered 95% of sprint commitments on time',
          ],
        },
      ],
      education: [
        { degree: 'B.Tech Computer Science & Engineering', institution: 'Anna University', year: '2019', gpa: '8.4/10' },
      ],
      skills: {
        technical: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'Express', 'PostgreSQL', 'MongoDB', 'AWS', 'Docker', 'Git', 'REST APIs', 'GraphQL', 'Redis'],
        soft: ['Leadership', 'Problem Solving', 'Communication', 'Agile', 'Team Collaboration'],
      },
      projects: [
        {
          name: 'Open Source Task Manager',
          description: 'Built full-stack task management app with real-time updates; 500+ GitHub stars',
          technologies: 'React, Node.js, Socket.io, MongoDB',
          link: 'github.com/arjunmehta/taskflow',
        },
      ],
      certifications: [
        { name: 'AWS Certified Developer – Associate', issuer: 'Amazon Web Services', year: '2023' },
        { name: 'Meta Front-End Developer Professional Certificate', issuer: 'Coursera', year: '2022' },
      ],
    },
  },
  {
    id: 'fresher-graduate',
    name: 'Fresher / Graduate',
    category: 'Technology',
    level: 'Entry Level',
    description: 'Recent graduate with internship, academic projects, and strong skills section.',
    accent: '#22c55e',
    resumeData: {
      name: 'Priya Sharma',
      email: 'priya.sharma@email.com',
      phone: '+91 87654 32109',
      location: 'Hyderabad, India',
      linkedin: 'linkedin.com/in/priyasharma',
      github: 'github.com/priyasharma',
      targetRole: 'Junior Software Developer',
      summary: 'Motivated Computer Science graduate with hands-on experience in web development through internships and academic projects. Proficient in Java, Python, and React with a strong foundation in data structures, algorithms, and object-oriented programming. Eager to contribute to innovative software teams.',
      experience: [
        {
          title: 'Software Development Intern',
          company: 'InfoCore Technologies',
          location: 'Hyderabad, India',
          startDate: 'Jan 2025',
          endDate: 'Jun 2025',
          current: false,
          bullets: [
            'Developed 3 responsive web pages using React and Tailwind CSS for client onboarding portal',
            'Assisted in API integration and unit testing, achieving 85% code coverage on assigned modules',
            'Participated in daily stand-ups and sprint planning under Agile methodology',
          ],
        },
      ],
      education: [
        { degree: 'B.Tech Computer Science & Engineering', institution: 'JNTU Hyderabad', year: '2025', gpa: '8.7/10' },
        { degree: 'Higher Secondary (12th)', institution: 'Narayana Junior College', year: '2021', gpa: '94%' },
      ],
      skills: {
        technical: ['Java', 'Python', 'JavaScript', 'React', 'HTML', 'CSS', 'SQL', 'Git', 'Data Structures', 'OOP', 'MySQL'],
        soft: ['Quick Learner', 'Teamwork', 'Communication', 'Problem Solving', 'Time Management'],
      },
      projects: [
        {
          name: 'E-Commerce Web Application',
          description: 'Built full-stack online store with user auth, cart, and payment simulation; grade A+ capstone project',
          technologies: 'React, Node.js, MongoDB, JWT',
          link: 'github.com/priyasharma/ecommerce-app',
        },
        {
          name: 'Student Attendance System',
          description: 'Desktop app automating attendance tracking for 500+ students using Java Swing and MySQL',
          technologies: 'Java, MySQL, Swing',
          link: '',
        },
      ],
      certifications: [
        { name: 'Google IT Support Professional Certificate', issuer: 'Coursera', year: '2024' },
        { name: 'Programming in Python – Meta', issuer: 'Coursera', year: '2024' },
      ],
    },
  },
  {
    id: 'digital-marketing',
    name: 'Digital Marketing Manager',
    category: 'Marketing',
    level: 'Experienced',
    description: 'Campaign results, ROI metrics, and platform expertise for marketing roles.',
    accent: '#f59e0b',
    resumeData: {
      name: 'Kavya Reddy',
      email: 'kavya.reddy@email.com',
      phone: '+91 91234 56780',
      location: 'Mumbai, India',
      linkedin: 'linkedin.com/in/kavyareddy',
      portfolio: 'kavyareddy.com',
      targetRole: 'Digital Marketing Manager',
      summary: 'Strategic Digital Marketing Manager with 6+ years driving brand growth across SEO, SEM, social media, and content marketing. Increased organic traffic by 150% and generated ₹2.5Cr in attributed revenue through data-driven campaigns. Expert in Google Ads, Meta Ads, Google Analytics, and marketing automation.',
      experience: [
        {
          title: 'Digital Marketing Manager',
          company: 'BrandPulse Media',
          location: 'Mumbai, India',
          startDate: 'Mar 2021',
          endDate: '',
          current: true,
          bullets: [
            'Managed ₹40L annual ad budget across Google and Meta; achieved 320% ROAS and 45% reduction in CPA',
            'Grew organic website traffic from 25K to 62K monthly visitors through SEO content strategy (150% increase)',
            'Led team of 5 specialists; launched 12 integrated campaigns generating ₹2.5Cr in attributed revenue',
            'Implemented HubSpot marketing automation, increasing lead conversion rate by 38%',
          ],
        },
        {
          title: 'Digital Marketing Executive',
          company: 'GrowthEdge Agency',
          location: 'Pune, India',
          startDate: 'Aug 2018',
          endDate: 'Feb 2021',
          current: false,
          bullets: [
            'Executed social media campaigns reaching 2M+ impressions per quarter across Instagram and LinkedIn',
            'Created 50+ SEO-optimized blog posts ranking on page 1 for 18 target keywords',
            'Analyzed campaign performance using Google Analytics; presented monthly reports to C-level stakeholders',
          ],
        },
      ],
      education: [
        { degree: 'MBA Marketing', institution: 'Symbiosis Institute', year: '2018', gpa: '' },
        { degree: 'B.Com', institution: 'Osmania University', year: '2016', gpa: '' },
      ],
      skills: {
        technical: ['Google Ads', 'Meta Ads', 'SEO', 'SEM', 'Google Analytics', 'HubSpot', 'Mailchimp', 'Canva', 'WordPress', 'Content Marketing', 'Social Media Marketing'],
        soft: ['Strategic Planning', 'Leadership', 'Analytics', 'Communication', 'Budget Management'],
      },
      projects: [],
      certifications: [
        { name: 'Google Ads Search Certification', issuer: 'Google', year: '2024' },
        { name: 'HubSpot Inbound Marketing Certification', issuer: 'HubSpot', year: '2023' },
        { name: 'Meta Blueprint Certified', issuer: 'Meta', year: '2023' },
      ],
    },
  },
  {
    id: 'data-analyst',
    name: 'Data Analyst',
    category: 'Analytics',
    level: 'Mid Level',
    description: 'SQL, Python, dashboards, and business impact metrics for analyst roles.',
    accent: '#8b5cf6',
    resumeData: {
      name: 'Rahul Verma',
      email: 'rahul.verma@email.com',
      phone: '+91 99887 76655',
      location: 'Delhi NCR, India',
      linkedin: 'linkedin.com/in/rahulverma',
      github: 'github.com/rahulverma',
      targetRole: 'Data Analyst',
      summary: 'Detail-oriented Data Analyst with 4 years transforming complex datasets into actionable business insights. Skilled in SQL, Python, Power BI, and Excel with proven ability to improve decision-making and operational efficiency. Reduced reporting time by 60% and identified cost savings of ₹18L annually.',
      experience: [
        {
          title: 'Data Analyst',
          company: 'FinServe Analytics',
          location: 'Gurgaon, India',
          startDate: 'Jul 2021',
          endDate: '',
          current: true,
          bullets: [
            'Built 15+ Power BI dashboards tracking KPIs for 200+ branch operations; adopted by C-suite for weekly reviews',
            'Automated monthly reporting with Python scripts, reducing manual effort from 40 hours to 8 hours (80% savings)',
            'Conducted cohort analysis identifying churn drivers; recommendations reduced customer attrition by 12%',
            'Partnered with product team on A/B test analysis, improving feature adoption by 22%',
          ],
        },
        {
          title: 'Junior Data Analyst',
          company: 'RetailMetrics India',
          location: 'Noida, India',
          startDate: 'Jun 2019',
          endDate: 'Jun 2021',
          current: false,
          bullets: [
            'Queried SQL databases (PostgreSQL) to extract sales, inventory, and customer data for 500+ SKUs',
            'Created Excel models forecasting demand with 92% accuracy during peak season',
            'Presented weekly insights to sales leadership, influencing pricing strategy across 3 product categories',
          ],
        },
      ],
      education: [
        { degree: 'B.Sc Statistics', institution: 'Delhi University', year: '2019', gpa: '8.2/10' },
      ],
      skills: {
        technical: ['SQL', 'Python', 'Pandas', 'Power BI', 'Tableau', 'Excel', 'Google Sheets', 'PostgreSQL', 'Data Visualization', 'Statistical Analysis', 'ETL'],
        soft: ['Analytical Thinking', 'Problem Solving', 'Communication', 'Attention to Detail', 'Business Acumen'],
      },
      projects: [
        {
          name: 'Sales Forecasting Model',
          description: 'Built time-series forecasting model in Python achieving 91% accuracy for quarterly revenue prediction',
          technologies: 'Python, Pandas, Scikit-learn',
          link: 'github.com/rahulverma/sales-forecast',
        },
      ],
      certifications: [
        { name: 'Google Data Analytics Professional Certificate', issuer: 'Coursera', year: '2023' },
        { name: 'Microsoft Power BI Data Analyst Associate', issuer: 'Microsoft', year: '2022' },
      ],
    },
  },
  {
    id: 'hr-professional',
    name: 'HR Manager',
    category: 'Human Resources',
    level: 'Experienced',
    description: 'Recruitment, employee engagement, and HR operations with measurable outcomes.',
    accent: '#ec4899',
    resumeData: {
      name: 'Ananya Iyer',
      email: 'ananya.iyer@email.com',
      phone: '+91 94444 33221',
      location: 'Chennai, India',
      linkedin: 'linkedin.com/in/ananyaiyer',
      targetRole: 'HR Manager',
      summary: 'People-focused HR Manager with 7+ years in talent acquisition, employee relations, and HR operations. Successfully hired 120+ employees, reduced time-to-hire by 35%, and improved employee satisfaction scores from 72% to 89%. Expert in HRIS, compliance, and performance management systems.',
      experience: [
        {
          title: 'HR Manager',
          company: 'CloudScale Technologies',
          location: 'Chennai, India',
          startDate: 'Apr 2020',
          endDate: '',
          current: true,
          bullets: [
            'Managed end-to-end recruitment for 120+ positions; reduced average time-to-hire from 45 to 29 days (35% improvement)',
            'Designed onboarding program improving 90-day retention rate from 78% to 94%',
            'Led employee engagement initiatives raising satisfaction survey scores from 72% to 89%',
            'Implemented Zoho People HRIS, automating leave, payroll, and performance review workflows for 350 employees',
          ],
        },
        {
          title: 'HR Executive',
          company: 'ManufacturePro Ltd',
          location: 'Coimbatore, India',
          startDate: 'May 2017',
          endDate: 'Mar 2020',
          current: false,
          bullets: [
            'Screened 2,000+ resumes and conducted 400+ interviews for technical and non-technical roles',
            'Managed payroll processing and statutory compliance (PF, ESI, TDS) for 180 employees',
            'Resolved 50+ employee grievances maintaining 95% resolution within SLA',
          ],
        },
      ],
      education: [
        { degree: 'MBA Human Resource Management', institution: 'XLRI Jamshedpur', year: '2017', gpa: '' },
        { degree: 'B.A Psychology', institution: 'Madras University', year: '2015', gpa: '' },
      ],
      skills: {
        technical: ['Talent Acquisition', 'HRIS', 'Zoho People', 'Payroll', 'Performance Management', 'Employee Relations', 'Compliance', 'HR Analytics', 'LinkedIn Recruiter'],
        soft: ['Leadership', 'Communication', 'Conflict Resolution', 'Negotiation', 'Empathy', 'Organizational Skills'],
      },
      projects: [],
      certifications: [
        { name: 'SHRM Certified Professional (SHRM-CP)', issuer: 'SHRM', year: '2022' },
        { name: 'Professional in Human Resources (PHR)', issuer: 'HRCI', year: '2021' },
      ],
    },
  },
  {
    id: 'sales-executive',
    name: 'Sales Executive',
    category: 'Sales',
    level: 'Experienced',
    description: 'Revenue targets, client relationships, and B2B sales achievements.',
    accent: '#ef4444',
    resumeData: {
      name: 'Vikram Singh',
      email: 'vikram.singh@email.com',
      phone: '+91 98123 45678',
      location: 'Pune, India',
      linkedin: 'linkedin.com/in/vikramsingh',
      targetRole: 'Senior Sales Executive',
      summary: 'High-performing B2B Sales Executive with 6+ years exceeding revenue targets in SaaS and enterprise software. Consistently achieved 120–140% of quota, closed deals worth ₹4.2Cr annually, and built pipeline of 80+ qualified leads. Strong negotiator with expertise in CRM, consultative selling, and client relationship management.',
      experience: [
        {
          title: 'Senior Sales Executive',
          company: 'SaaSify India',
          location: 'Pune, India',
          startDate: 'Feb 2021',
          endDate: '',
          current: true,
          bullets: [
            'Exceeded annual sales quota by 135%, generating ₹4.2Cr in new business revenue across 28 enterprise accounts',
            'Built and managed pipeline of 80+ qualified leads using Salesforce CRM; conversion rate of 32%',
            'Negotiated contracts averaging ₹15L deal size; reduced sales cycle from 90 to 65 days',
            'Awarded "Top Performer" for 3 consecutive quarters; mentored 2 junior sales representatives',
          ],
        },
        {
          title: 'Sales Executive',
          company: 'TechSell Solutions',
          location: 'Mumbai, India',
          startDate: 'Jul 2018',
          endDate: 'Jan 2021',
          current: false,
          bullets: [
            'Acquired 45 new B2B clients in IT services sector, contributing ₹1.8Cr in first-year revenue',
            'Conducted 200+ product demos and presentations to C-level and IT decision makers',
            'Maintained 92% client retention rate through proactive account management and quarterly business reviews',
          ],
        },
      ],
      education: [
        { degree: 'BBA Marketing', institution: 'Pune University', year: '2018', gpa: '' },
      ],
      skills: {
        technical: ['B2B Sales', 'Salesforce CRM', 'Lead Generation', 'Negotiation', 'Pipeline Management', 'Consultative Selling', 'Account Management', 'SaaS Sales'],
        soft: ['Communication', 'Persuasion', 'Relationship Building', 'Target Driven', 'Presentation Skills'],
      },
      projects: [],
      certifications: [
        { name: 'Salesforce Certified Administrator', issuer: 'Salesforce', year: '2023' },
      ],
    },
  },
  {
    id: 'finance-accountant',
    name: 'Finance & Accounting',
    category: 'Finance',
    level: 'Experienced',
    description: 'Accounting, financial reporting, audit, and compliance expertise.',
    accent: '#14b8a6',
    resumeData: {
      name: 'Deepak Nair',
      email: 'deepak.nair@email.com',
      phone: '+91 93456 78901',
      location: 'Kochi, India',
      linkedin: 'linkedin.com/in/deepaknair',
      targetRole: 'Senior Accountant',
      summary: 'Detail-oriented Chartered Accountant with 5+ years in financial reporting, taxation, and audit compliance. Managed accounts for ₹50Cr+ revenue organization, ensured 100% statutory compliance, and reduced month-end close time by 40%. Proficient in Tally, SAP, and advanced Excel.',
      experience: [
        {
          title: 'Senior Accountant',
          company: 'GlobalTrade Exports Pvt Ltd',
          location: 'Kochi, India',
          startDate: 'May 2021',
          endDate: '',
          current: true,
          bullets: [
            'Managed full-cycle accounting for ₹50Cr annual revenue; prepared monthly P&L, balance sheet, and cash flow statements',
            'Reduced month-end close process from 10 days to 6 days (40% improvement) through process automation',
            'Ensured 100% GST, TDS, and income tax compliance with zero penalties over 3 consecutive years',
            'Led annual external audit; resolved 100% of audit queries with no material adjustments',
          ],
        },
        {
          title: 'Accountant',
          company: 'Coastal Logistics Ltd',
          location: 'Ernakulam, India',
          startDate: 'Jun 2019',
          endDate: 'Apr 2021',
          current: false,
          bullets: [
            'Processed 500+ vendor invoices monthly; maintained accounts payable aging under 30 days',
            'Reconciled bank statements and prepared GST returns for 2 business units',
            'Implemented Tally ERP migration improving reporting accuracy and reducing manual errors by 25%',
          ],
        },
      ],
      education: [
        { degree: 'CA (Chartered Accountant)', institution: 'ICAI', year: '2019', gpa: '' },
        { degree: 'B.Com', institution: 'Mahatma Gandhi University', year: '2016', gpa: 'First Class' },
      ],
      skills: {
        technical: ['Financial Reporting', 'GST', 'TDS', 'Tally ERP', 'SAP', 'Excel', 'Audit', 'Taxation', 'Accounts Payable', 'Accounts Receivable', 'Budgeting'],
        soft: ['Attention to Detail', 'Analytical Skills', 'Integrity', 'Time Management', 'Compliance'],
      },
      projects: [],
      certifications: [
        { name: 'Chartered Accountant (CA)', issuer: 'ICAI', year: '2019' },
      ],
    },
  },
  {
    id: 'blank',
    name: 'Blank Template',
    category: 'General',
    level: 'All Levels',
    description: 'Start from scratch with empty ATS-safe sections.',
    accent: '#64748b',
    resumeData: emptyResumeData(),
  },
];

export function listResumeTemplates() {
  return TEMPLATES.map(({ id, name, category, level, description, accent }) => ({
    id,
    name,
    category,
    level,
    description,
    accent,
  }));
}

export function getResumeTemplate(templateId) {
  const found = TEMPLATES.find((t) => t.id === templateId);
  if (!found) return null;
  return {
    id: found.id,
    name: found.name,
    category: found.category,
    level: found.level,
    description: found.description,
    accent: found.accent,
    resumeData: sanitizeResumeData(found.resumeData),
  };
}

export function getAllResumeTemplates() {
  return TEMPLATES.map((t) => ({
    ...t,
    resumeData: sanitizeResumeData(t.resumeData),
  }));
}
