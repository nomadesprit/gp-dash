export const MAX_CAMPAIGN_USERS = 5000;
export const MAX_CAMPAIGN_BODY_BYTES = 512 * 1024;

const requiredText = (value, field, maxLength) => {
  const text = String(value || '').trim();
  if (!text || text.length > maxLength) throw new Error(`${field} is missing or too long.`);
  return text;
};

export function validateCampaignRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Request must be an object.');
  if (!Array.isArray(input.userIds) || input.userIds.length === 0) throw new Error('At least one user ID is required.');
  if (input.userIds.length > MAX_CAMPAIGN_USERS) throw new Error(`At most ${MAX_CAMPAIGN_USERS} user IDs are allowed.`);
  const campaign = input.campaign || {};
  return {
    campaign: {
      campaignId: requiredText(campaign.campaignId, 'Campaign ID', 64),
      name: requiredText(campaign.name, 'Campaign name', 120),
      brand: requiredText(campaign.brand, 'Brand', 80),
      store: requiredText(campaign.store, 'Store', 40),
      country: requiredText(campaign.country, 'Country', 80),
      startDate: String(campaign.startDate || '').trim(),
      endDate: String(campaign.endDate || '').trim(),
    },
    userIds: input.userIds.map(value => String(value ?? '').trim()),
    rotateExisting: input.rotateExisting === true,
  };
}

export function jsonNoStore(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}
