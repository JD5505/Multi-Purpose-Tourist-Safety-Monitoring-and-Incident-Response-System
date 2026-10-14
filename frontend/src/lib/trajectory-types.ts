export const BUFFER_SIZE = 31;
export const ANOMALY_THRESHOLD = 0.326157; 

export type TrackPoint = {
  latitude: number;
  longitude: number;
  timestamp: string;
};

export type MapCoordinate = {
  lat: number;
  lng: number;
};

export type BackendCoordinate = {
  lat: number;
  long: number;
};

export type DetectionStatus = "Idle" | "Normal" | "Anomaly";

export type DetectionResponse = {
  status: "Normal" | "Anomaly";
  mse: number;
};

export type Profile = {
  email: string;
  role: string;
};

export type GeofenceZoneType = "SAFE" | "CAUTION" | "DANGER";

export type LlmEvaluation = {
  risk_category: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | string;
  message: string;
  risk_score: string | number;
  recommended_actions: string;
};

export type GeofencePingRequest = {
  lat: number;
  long: number;
  timestamp: string;
  caution_zone_coords: BackendCoordinate[];
  danger_zone_coords: BackendCoordinate[];
};

export type GeofencePingResponse = {
  llm_eval: LlmEvaluation | string | null;
  "GRU_Autoencoder output"?: number | number[];
};

export type GeofenceDefinition = {
  type: "polygon" | "circle";
  center?: MapCoordinate;
  radiusMeters?: number;
  dangerCoords: BackendCoordinate[];
  cautionCoords: BackendCoordinate[];
};
