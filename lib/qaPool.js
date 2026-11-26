const ENGAGEMENT_PUBLISHED_WEIGHT = 5;
const ENGAGEMENT_VOTE_WEIGHT = 2;

function weightFor(strategy, s) {
  const messages = Number(s.message_count) || 0;
  const published = Number(s.published_count) || 0;
  const votes = Number(s.vote_count) || 0;
  if (strategy === 'volume') return messages;
  if (strategy === 'engagement') {
    return messages + ENGAGEMENT_PUBLISHED_WEIGHT * published + ENGAGEMENT_VOTE_WEIGHT * votes;
  }
  return messages > 0 || published > 0 ? 1 : 0;
}

function computeShares(strategy, stats, poolTwd) {
  const pool = Math.max(0, Math.floor(Number(poolTwd) || 0));
  const weighted = (stats || [])
    .map((s) => ({
      therapist_id: s.therapist_id,
      message_count: Number(s.message_count) || 0,
      published_count: Number(s.published_count) || 0,
      vote_count: Number(s.vote_count) || 0,
      weight: weightFor(strategy, s),
    }))
    .filter((s) => s.weight > 0);

  const totalWeight = weighted.reduce((a, s) => a + s.weight, 0);
  if (totalWeight <= 0 || pool <= 0) {
    return weighted.map((s) => ({ ...s, share_twd: 0 }));
  }

  const shares = weighted.map((s) => ({ ...s, share_twd: Math.floor((pool * s.weight) / totalWeight) }));

  const distributed = shares.reduce((a, s) => a + s.share_twd, 0);
  const remainder = pool - distributed;
  if (remainder > 0) {
    let top = 0;
    for (let i = 1; i < shares.length; i += 1) {
      if (shares[i].weight > shares[top].weight ||
         (shares[i].weight === shares[top].weight && shares[i].therapist_id < shares[top].therapist_id)) {
        top = i;
      }
    }
    shares[top].share_twd += remainder;
  }
  return shares;
}

module.exports = { computeShares, ENGAGEMENT_PUBLISHED_WEIGHT, ENGAGEMENT_VOTE_WEIGHT };
