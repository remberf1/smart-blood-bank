// Haversine formula to calculate distance between two coordinates (in km)
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Enhanced distance score with exponential decay
// - Within 20km: linear decay from 1.0 to 0.5
// - Within 50km: linear decay from 0.5 to 0.1
// - Within 100km: linear decay from 0.1 to 0
// - Beyond 100km: 0
function getDistanceScore(distanceKm) {
  if (distanceKm <= 0) return 1;
  
  // Within 20km: 1.0 down to 0.5
  if (distanceKm <= 20) {
    return 1 - (distanceKm / 20) * 0.5;
  }
  
  // Within 50km: 0.5 down to 0.1
  if (distanceKm <= 50) {
    return 0.5 - ((distanceKm - 20) / 30) * 0.4;
  }
  
  // Within 100km: 0.1 down to 0
  if (distanceKm <= 100) {
    return 0.1 - ((distanceKm - 50) / 50) * 0.1;
  }
  
  // Beyond 100km: zero
  return 0;
}

// Recency score: inverse of minutes since last update (capped at 120 min)
function getRecencyScore(lastUpdated) {
  const minutesSince = (Date.now() - new Date(lastUpdated).getTime()) / (1000 * 60);
  if (minutesSince >= 120) return 0;
  return 1 / (1 + minutesSince);
}

// Stock score: normalized by max units in dataset
function getStockScore(units, maxUnitsInDataset) {
  if (maxUnitsInDataset === 0) return 0;
  return units / maxUnitsInDataset;
}

module.exports = { 
  haversineDistance, 
  getDistanceScore, 
  getRecencyScore, 
  getStockScore 
};