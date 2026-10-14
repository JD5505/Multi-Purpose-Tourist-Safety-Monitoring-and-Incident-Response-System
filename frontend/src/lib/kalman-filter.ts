export interface KalmanEstimate {
  lat: number;
  lng: number;
  accuracy: number; 
  timestamp: string;
}

export class GpsKalmanFilter {
  private lat: number | null = null;
  private lng: number | null = null;
  private varianceLat: number = 0;
  private varianceLng: number = 0;
  private lastTimestampMs: number = 0;
  private estimatedAccuracyMeters: number = 0;

  private readonly defaultSpeedMps: number;

  constructor(defaultSpeedMps = 3.0) {
    this.defaultSpeedMps = defaultSpeedMps;
  }

  public reset(): void {
    this.lat = null;
    this.lng = null;
    this.varianceLat = 0;
    this.varianceLng = 0;
    this.lastTimestampMs = 0;
    this.estimatedAccuracyMeters = 0;
  }

  public isInitialized(): boolean {
    return this.lat !== null && this.lng !== null;
  }

  public update(
    rawLat: number,
    rawLng: number,
    rawAccuracyMeters: number,
    timestampMs: number = Date.now(),
    measuredSpeedMps?: number | null,
  ): KalmanEstimate {

    const accuracy = Math.max(1, rawAccuracyMeters);
    const METERS_PER_DEG_LAT = 111_139;
    const cosLat = Math.cos((rawLat * Math.PI) / 180);
    const METERS_PER_DEG_LNG = 111_139 * (Math.abs(cosLat) > 0.001 ? Math.abs(cosLat) : 1);

    const varianceMeasurementLat = (accuracy / METERS_PER_DEG_LAT) ** 2;
    const varianceMeasurementLng = (accuracy / METERS_PER_DEG_LNG) ** 2;

    if (this.lat === null || this.lng === null || this.lastTimestampMs === 0) {

      this.lat = rawLat;
      this.lng = rawLng;
      this.varianceLat = varianceMeasurementLat;
      this.varianceLng = varianceMeasurementLng;
      this.lastTimestampMs = timestampMs;
      this.estimatedAccuracyMeters = accuracy;

      return {
        lat: Number(this.lat.toFixed(7)),
        lng: Number(this.lng.toFixed(7)),
        accuracy: Number(this.estimatedAccuracyMeters.toFixed(1)),
        timestamp: new Date(timestampMs).toISOString(),
      };
    }

    const dtSeconds = Math.max(0.1, Math.min(30, (timestampMs - this.lastTimestampMs) / 1000));
    this.lastTimestampMs = timestampMs;

    const speed =
      measuredSpeedMps && measuredSpeedMps > 0
        ? Math.max(measuredSpeedMps, this.defaultSpeedMps)
        : this.defaultSpeedMps;

    const maxMovementDistMeters = speed * dtSeconds;
    const qLat = (maxMovementDistMeters / METERS_PER_DEG_LAT) ** 2;
    const qLng = (maxMovementDistMeters / METERS_PER_DEG_LNG) ** 2;

    const predictedVarLat = this.varianceLat + qLat;
    const predictedVarLng = this.varianceLng + qLng;

    const kLat = predictedVarLat / (predictedVarLat + varianceMeasurementLat);
    const kLng = predictedVarLng / (predictedVarLng + varianceMeasurementLng);

    this.lat = this.lat + kLat * (rawLat - this.lat);
    this.lng = this.lng + kLng * (rawLng - this.lng);

    this.varianceLat = (1 - kLat) * predictedVarLat;
    this.varianceLng = (1 - kLng) * predictedVarLng;

    this.estimatedAccuracyMeters = Math.max(0.5, Math.sqrt(this.varianceLat) * METERS_PER_DEG_LAT);

    return {
      lat: Number(this.lat.toFixed(7)),
      lng: Number(this.lng.toFixed(7)),
      accuracy: Number(this.estimatedAccuracyMeters.toFixed(1)),
      timestamp: new Date(timestampMs).toISOString(),
    };
  }

  public getEstimate(): KalmanEstimate | null {
    if (this.lat === null || this.lng === null) return null;
    return {
      lat: Number(this.lat.toFixed(7)),
      lng: Number(this.lng.toFixed(7)),
      accuracy: Number(this.estimatedAccuracyMeters.toFixed(1)),
      timestamp: new Date(this.lastTimestampMs).toISOString(),
    };
  }
}
