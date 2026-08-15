'use strict';

let cache = { at: 0, aircraft: [], source: 'none' };
const CACHE_MS = 10000;
const MOCK = [
  { callsign:'Shamrock-1337', playerName:'SkylineEcho', aircraftType:'Airbus A330', altitude:30690, heading:290, speed:299, groundSpeed:209, isOnGround:false, isEmergencyOccuring:false, position:{x:-10906,y:-23349} },
  { callsign:'Speedbird-204', playerName:'CloudVector', aircraftType:'Boeing 787-9', altitude:18120, heading:74, speed:274, groundSpeed:191, isOnGround:false, isEmergencyOccuring:false, position:{x:8400,y:-9120} },
  { callsign:'Cessna-51K', playerName:'PatternPilot', aircraftType:'Cessna 172', altitude:0, heading:182, speed:18, groundSpeed:12, isOnGround:true, isEmergencyOccuring:false, position:{x:2200,y:1040} },
  { callsign:'Cargo-701', playerName:'FreightDeck', aircraftType:'Boeing 767F', altitude:7420, heading:228, speed:191, groundSpeed:139, isOnGround:false, isEmergencyOccuring:true, position:{x:-4030,y:8010} }
];

function sanitize(raw) {
  return Object.entries(raw || {}).map(([callsign, a]) => ({
    callsign: String(callsign).slice(0, 60), playerName: String(a?.playerName || 'Unknown').slice(0, 60), aircraftType: String(a?.aircraftType || 'Unknown').slice(0, 80),
    altitude: Number(a?.altitude) || 0, heading: Number(a?.heading) || 0, speed: Number(a?.speed) || 0, groundSpeed: Number(a?.groundSpeed) || 0,
    isOnGround: a?.isOnGround === true, isEmergencyOccuring: a?.isEmergencyOccuring === true,
    position: { x: Number(a?.position?.x) || 0, y: Number(a?.position?.y) || 0 }
  }));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  const now = Date.now();
  if (now - cache.at < CACHE_MS && cache.aircraft.length) return res.status(200).json({ ok:true, source:cache.source, cached:true, updatedAt:new Date(cache.at).toISOString(), aircraft:cache.aircraft });
  if (String(process.env.USE_MOCK_24DATA).toLowerCase() === 'true') {
    cache = { at: now, aircraft: MOCK, source:'mock' };
    return res.status(200).json({ ok:true, source:'mock', cached:false, updatedAt:new Date(now).toISOString(), aircraft:MOCK });
  }
  try {
    const response = await fetch('https://24data.ptfs.app/acft-data', { headers: { 'User-Agent': '24PilotDeviation/1.0' }, signal: AbortSignal.timeout(4500) });
    if (!response.ok) throw new Error(`24Data HTTP ${response.status}`);
    const aircraft = sanitize(await response.json());
    cache = { at: now, aircraft, source:'24data' };
    return res.status(200).json({ ok:true, source:'24data', cached:false, updatedAt:new Date(now).toISOString(), aircraft });
  } catch (error) {
    if (cache.aircraft.length) return res.status(200).json({ ok:true, source:cache.source, stale:true, updatedAt:new Date(cache.at).toISOString(), aircraft:cache.aircraft });
    return res.status(503).json({ ok:false, source:'offline', error:'24data_unavailable', aircraft:[] });
  }
};