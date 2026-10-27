import { prisma } from '../lib/prisma.js';

// PRD FR-15 — every dashboard number is computed ONLY from database records
// (listings, claims, redistribution logs created by real actions in the app).
// Definitions are fixed here so the displayed numbers can be verified by hand:
//   portionsListed    = SUM(Listing.totalPortions)
//   portionsClaimed   = SUM(Claim.portionsClaimed) over claims CONFIRMED or COLLECTED
//   portionsCollected = SUM(Claim.portionsClaimed) over claims COLLECTED
//   completionRate    = portionsCollected / portionsClaimed (0 when denominator is 0)
//   expiredListings   = COUNT(Listing WHERE status = EXPIRED)
//   ngoRedistributed  = SUM(RedistributionLog.portions)
async function aggregates(whereListing, whereClaim, client) {
  const [listingsCreated, listedAgg, claimedAgg, collectedAgg, expiredListings, redistAgg] =
    await Promise.all([
      client.listing.count({ where: whereListing }),
      client.listing.aggregate({ where: whereListing, _sum: { totalPortions: true } }),
      client.claim.aggregate({
        where: { ...whereClaim, status: { in: ['CONFIRMED', 'COLLECTED'] } },
        _sum: { portionsClaimed: true },
      }),
      client.claim.aggregate({
        where: { ...whereClaim, status: 'COLLECTED' },
        _sum: { portionsClaimed: true },
      }),
      client.listing.count({ where: { ...whereListing, status: 'EXPIRED' } }),
      client.redistributionLog.aggregate({ _sum: { portions: true } }),
    ]);
  const portionsClaimed = claimedAgg._sum.portionsClaimed ?? 0;
  const portionsCollected = collectedAgg._sum.portionsClaimed ?? 0;
  return {
    listingsCreated,
    portionsListed: listedAgg._sum.totalPortions ?? 0,
    portionsClaimed,
    portionsCollected,
    completionRate:
      portionsClaimed === 0 ? 0 : Math.round((portionsCollected / portionsClaimed) * 1000) / 10,
    expiredListings,
    ngoPortionsRedistributed: redistAgg._sum.portions ?? 0,
  };
}

export async function platformImpact(client = prisma) {
  return aggregates({}, {}, client);
}

export async function userImpact(user, client = prisma) {
  if (user.role === 'ADMIN') return platformImpact(client);
  if (user.role === 'PROVIDER') {
    return aggregates({ providerId: user.id }, { listing: { providerId: user.id } }, client);
  }
  // CLAIMER / NGO: their own claim activity.
  const [claimedAgg, collectedAgg, redistAgg] = await Promise.all([
    client.claim.aggregate({
      where: { claimerId: user.id, status: { in: ['CONFIRMED', 'COLLECTED'] } },
      _sum: { portionsClaimed: true },
    }),
    client.claim.aggregate({
      where: { claimerId: user.id, status: 'COLLECTED' },
      _sum: { portionsClaimed: true },
    }),
    user.role === 'NGO'
      ? client.redistributionLog.aggregate({
          where: { ngoId: user.id },
          _sum: { portions: true },
        })
      : Promise.resolve({ _sum: { portions: 0 } }),
  ]);
  const portionsClaimed = claimedAgg._sum.portionsClaimed ?? 0;
  const portionsCollected = collectedAgg._sum.portionsClaimed ?? 0;
  return {
    portionsClaimed,
    portionsCollected,
    completionRate:
      portionsClaimed === 0 ? 0 : Math.round((portionsCollected / portionsClaimed) * 1000) / 10,
    ngoPortionsRedistributed: redistAgg._sum.portions ?? 0,
  };
}
