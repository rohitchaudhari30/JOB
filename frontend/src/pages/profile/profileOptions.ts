/** Static option lists and formatters for the candidate profile form. */

export const NOTICE_PERIOD_OPTIONS = [
  { label: 'Immediate (0 Days)', value: 0 },
  { label: '15 Days', value: 15 },
  { label: '30 Days (1 Mo)', value: 30 },
  { label: '45 Days', value: 45 },
  { label: '60 Days (2 Mos)', value: 60 },
  { label: '90 Days (3 Mos)', value: 90 },
];

export const WORK_AUTH_OPTIONS = [
  'Indian Citizen (No Visa / Sponsorship Needed)',
  'Authorized to work without sponsorship',
  'Require Visa Sponsorship',
  'Permanent Resident / Green Card',
  'US / EU / UK Citizen',
];

export const POPULAR_SKILLS = [
  'Python',
  'TypeScript',
  'React',
  'FastAPI',
  'Node.js',
  'SQL',
  'PostgreSQL',
  'AWS',
  'Docker',
  'Kubernetes',
  'Tailwind CSS',
  'Git',
];

export const formatLPA = (amount?: number) => {
  if (!amount || amount <= 0) return null;
  const lpa = (amount / 100000).toFixed(2);
  return `₹${lpa} Lakhs/yr (₹${amount.toLocaleString('en-IN')})`;
};
