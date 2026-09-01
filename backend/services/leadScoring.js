import Contact from '../models/Contact.js';
import Deal from '../models/Deal.js';
import Task from '../models/Task.js';

const STATUS_SCORE = {
  lead: 15,
  prospect: 40,
  customer: 70,
  inactive: 5,
};

const STAGE_SCORE = {
  lead: 10,
  qualified: 25,
  proposal: 40,
  negotiation: 55,
  won: 80,
  lost: 0,
};

export async function calculateLeadScore(contactId) {
  const contact = await Contact.findById(contactId);
  if (!contact) return 0;

  let score = STATUS_SCORE[contact.status] || 10;

  if (contact.email) score += 8;
  if (contact.phone) score += 8;
  if (contact.company) score += 6;
  if (contact.notes?.trim()) score += 4;

  const sourceBoost = {
    referral: 12,
    ads: 8,
    website: 6,
    form: 6,
    social: 5,
    ai: 4,
    import: 3,
    manual: 2,
    other: 1,
  };
  score += sourceBoost[contact.source] || 0;
  if (contact.campaign?.trim()) score += 3;
  if (contact.utmSource || contact.utmCampaign) score += 2;
  if (contact.city?.trim() || contact.address?.trim()) score += 3;

  const deals = await Deal.find({ contact: contactId });
  const openDeals = deals.filter((d) => !['won', 'lost'].includes(d.stage));
  const wonDeals = deals.filter((d) => d.stage === 'won');

  score += Math.min(20, openDeals.length * 8);
  score += Math.min(25, wonDeals.length * 12);

  const bestStage = deals.reduce((best, deal) => {
    const value = STAGE_SCORE[deal.stage] || 0;
    return Math.max(best, value);
  }, 0);
  score += Math.min(20, Math.round(bestStage * 0.25));

  const dealValue = openDeals.reduce((sum, d) => sum + (d.value || 0), 0);
  if (dealValue >= 100000) score += 15;
  else if (dealValue >= 50000) score += 10;
  else if (dealValue >= 10000) score += 6;

  const openTasks = await Task.countDocuments({
    contact: contactId,
    status: { $ne: 'completed' },
  });
  score += Math.min(10, openTasks * 3);

  const daysSinceUpdate = Math.max(
    0,
    Math.floor((Date.now() - new Date(contact.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
  );
  if (daysSinceUpdate <= 3) score += 10;
  else if (daysSinceUpdate <= 7) score += 6;
  else if (daysSinceUpdate <= 14) score += 2;
  else if (daysSinceUpdate > 45) score -= 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreLabel(score) {
  if (score >= 75) return 'Hot';
  if (score >= 50) return 'Warm';
  if (score >= 25) return 'Cool';
  return 'Cold';
}

export async function refreshAllLeadScores() {
  const contacts = await Contact.find().select('_id');
  const updates = [];
  for (const contact of contacts) {
    const score = await calculateLeadScore(contact._id);
    updates.push(
      Contact.findByIdAndUpdate(contact._id, {
        leadScore: score,
        leadScoreLabel: scoreLabel(score),
        leadScoredAt: new Date(),
      })
    );
  }
  await Promise.all(updates);
  return contacts.length;
}
