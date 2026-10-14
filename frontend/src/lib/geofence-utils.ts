import type { BackendCoordinate, LlmEvaluation, MapCoordinate } from "./trajectory-types";

const EARTH_RADIUS = 6_371_000; 

export function distanceMeters(a: MapCoordinate, b: MapCoordinate): number {
  const latDelta = ((b.lat - a.lat) * Math.PI) / 180;
  const lngDelta = ((b.lng - a.lng) * Math.PI) / 180;
  const latA = (a.lat * Math.PI) / 180;
  const latB = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(latDelta / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(lngDelta / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

export function generateCircleCoordinates(
  centerLat: number,
  centerLng: number,
  radiusMeters: number,
  pointsCount = 64,
): BackendCoordinate[] {
  const coords: BackendCoordinate[] = [];
  const latRad = (centerLat * Math.PI) / 180;
  const lngRad = (centerLng * Math.PI) / 180;
  const dRad = radiusMeters / EARTH_RADIUS;

  for (let i = 0; i <= pointsCount; i++) {
    const bearing = (i * 2 * Math.PI) / pointsCount;
    const ptLatRad = Math.asin(
      Math.sin(latRad) * Math.cos(dRad) + Math.cos(latRad) * Math.sin(dRad) * Math.cos(bearing),
    );
    const ptLngRad =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(dRad) * Math.cos(latRad),
        Math.cos(dRad) - Math.sin(latRad) * Math.sin(ptLatRad),
      );

    coords.push({
      lat: Number(((ptLatRad * 180) / Math.PI).toFixed(7)),
      long: Number(((ptLngRad * 180) / Math.PI).toFixed(7)),
    });
  }
  return coords;
}

export function bufferPolygonMeters(
  coords: Array<{ lat: number; lng?: number; long?: number }>,
  bufferMeters: number,
): BackendCoordinate[] {
  const normalized = coords.map((c) => ({
    lat: c.lat,
    lng: c.lng ?? c.long ?? 0,
  }));

  const unique = normalized.filter((c, idx) => {
    if (idx === 0) return true;
    return c.lat !== normalized[0].lat || c.lng !== normalized[0].lng;
  });

  if (unique.length < 3) return [];

  const centerLat = unique.reduce((sum, p) => sum + p.lat, 0) / unique.length;
  const centerLng = unique.reduce((sum, p) => sum + p.lng, 0) / unique.length;
  const latRad = (centerLat * Math.PI) / 180;
  const cosLat = Math.cos(latRad);

  const localPts = unique.map((p) => {
    const y = (((p.lat - centerLat) * Math.PI) / 180) * EARTH_RADIUS;
    const x = (((p.lng - centerLng) * Math.PI) / 180) * EARTH_RADIUS * cosLat;
    return { x, y };
  });

  let signedArea = 0;
  for (let i = 0; i < localPts.length; i++) {
    const j = (i + 1) % localPts.length;
    signedArea += localPts[i].x * localPts[j].y - localPts[j].x * localPts[i].y;
  }
  const isCCW = signedArea > 0;

  const n = localPts.length;
  const bufferedPts: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < n; i++) {
    const prev = localPts[(i - 1 + n) % n];
    const curr = localPts[i];
    const next = localPts[(i + 1) % n];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.hypot(dx1, dy1) || 1;
    const n1 = isCCW ? { x: dy1 / len1, y: -dx1 / len1 } : { x: -dy1 / len1, y: dx1 / len1 };

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2) || 1;
    const n2 = isCCW ? { x: dy2 / len2, y: -dx2 / len2 } : { x: -dy2 / len2, y: dx2 / len2 };

    const p1 = { x: curr.x + n1.x * bufferMeters, y: curr.y + n1.y * bufferMeters };
    const p2 = { x: curr.x + n2.x * bufferMeters, y: curr.y + n2.y * bufferMeters };

    bufferedPts.push(p1);

    const angle1 = Math.atan2(n1.y, n1.x);
    let angle2 = Math.atan2(n2.y, n2.x);
    if (isCCW && angle2 < angle1) angle2 += 2 * Math.PI;
    if (!isCCW && angle2 > angle1) angle2 -= 2 * Math.PI;

    const angleDiff = Math.abs(angle2 - angle1);
    if (angleDiff > 0.05 && angleDiff < Math.PI * 1.5) {
      const steps = Math.min(8, Math.max(2, Math.floor(angleDiff / (Math.PI / 6))));
      for (let s = 1; s < steps; s++) {
        const a = angle1 + (angle2 - angle1) * (s / steps);
        bufferedPts.push({
          x: curr.x + Math.cos(a) * bufferMeters,
          y: curr.y + Math.sin(a) * bufferMeters,
        });
      }
    }
    bufferedPts.push(p2);
  }

  const result: BackendCoordinate[] = bufferedPts.map((p) => {
    const lat = centerLat + (p.y / EARTH_RADIUS) * (180 / Math.PI);
    const lng = centerLng + (p.x / (EARTH_RADIUS * cosLat)) * (180 / Math.PI);
    return {
      lat: Number(lat.toFixed(7)),
      long: Number(lng.toFixed(7)),
    };
  });

  if (result.length > 0) {
    result.push({ ...result[0] });
  }

  return result;
}

export function isPointInPolygon(
  point: { lat: number; lng?: number; long?: number },
  polygon: Array<{ lat: number; lng?: number; long?: number }>,
): boolean {
  if (polygon.length < 3) return false;
  const ptLng = point.lng ?? point.long ?? 0;
  const ptLat = point.lat;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng ?? polygon[i].long ?? 0;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng ?? polygon[j].long ?? 0;
    const yj = polygon[j].lat;

    const intersect =
      yi > ptLat !== yj > ptLat && ptLng < ((xj - xi) * (ptLat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }

  return inside;
}

export function evaluateGeofenceZone(
  point: { lat: number; lng?: number; long?: number },
  dangerCoords: BackendCoordinate[],
  cautionCoords: BackendCoordinate[],
): "SAFE" | "CAUTION" | "DANGER" {
  if (dangerCoords.length >= 3 && isPointInPolygon(point, dangerCoords)) {
    return "DANGER";
  }
  if (cautionCoords.length >= 3 && isPointInPolygon(point, cautionCoords)) {
    return "CAUTION";
  }
  return "SAFE";
}

export function parseLlmEval(evalData: unknown): LlmEvaluation | null {
  if (!evalData) return null;
  let parsed = evalData;

  if (typeof evalData === "string") {
    try {
      const cleaned = evalData
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        risk_category: "UNKNOWN",
        message: evalData,
        risk_score: "N/A",
        recommended_actions: "Review safety perimeter and move to designated safe zone.",
      };
    }
  }

  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;
    const rawCategory = String(obj["risk_category"] ?? "UNKNOWN").toUpperCase();
    const category = ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(rawCategory)
      ? (rawCategory as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL")
      : "HIGH";

    return {
      risk_category: category,
      message: String(obj["message"] ?? "Perimeter boundary breach detected."),
      risk_score: (obj["risk_score"] as string | number) ?? "N/A",
      recommended_actions: String(
        obj["recommended_actions"] ?? "Retreat from restricted area immediately.",
      ),
    };
  }

  return null;
}
