import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Compass,
  Crosshair,
  Eye,
  Layers,
  LogOut,
  MapPin,
  Navigation,
  Pentagon,
  Radio,
  Route as RouteIcon,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import LlmEvaluationCard from "./LlmEvaluationCard";
import { api } from "@/lib/api";
import {
  bufferPolygonMeters,
  distanceMeters,
  evaluateGeofenceZone,
  generateCircleCoordinates,
  parseLlmEval,
} from "@/lib/geofence-utils";
import { GpsKalmanFilter } from "@/lib/kalman-filter";
import {
  BUFFER_SIZE,
  type BackendCoordinate,
  type DetectionResponse,
  type DetectionStatus,
  type GeofenceZoneType,
  type LlmEvaluation,
  type MapCoordinate,
  type Profile,
  type TrackPoint,
} from "@/lib/trajectory-types";

const TrajectoryMap = lazy(() => import("./TrajectoryMap"));

export default function Dashboard({
  profile,
  onLogout,
}: {
  profile: Profile | null;
  onLogout: () => void;
}) {

  const trajectoryBuffer = useRef<TrackPoint[]>([]);
  const loggingIntervalId = useRef<number | null>(null);
  const geoWatchId = useRef<number | null>(null);
  const kalmanFilter = useRef<GpsKalmanFilter>(new GpsKalmanFilter(3.0));
  const requestInFlight = useRef(false);
  const latestRawGps = useRef<{
    lat: number;
    lng: number;
    accuracy: number;
    speed?: number | null;
    timestamp: number;
  } | null>(null);

  const dangerCoordsRef = useRef<BackendCoordinate[]>([]);
  const cautionCoordsRef = useRef<BackendCoordinate[]>([]);
  const lastPingedZoneRef = useRef<GeofenceZoneType>("SAFE");
  const currentSmoothedPosRef = useRef<MapCoordinate | null>(null);

  const [isTracking, setIsTracking] = useState(false);
  const [bufferCount, setBufferCount] = useState(0);
  const [currentStatus, setCurrentStatus] = useState<DetectionStatus>("Idle");
  const [trackingMessage, setTrackingMessage] = useState<string | null>(null);
  const [filteredAccuracy, setFilteredAccuracy] = useState<number | null>(null);
  const [rawAccuracy, setRawAccuracy] = useState<number | null>(null);
  const [, setRawMseTelemetry] = useState<number | null>(null);
  const [mapPolylineCoords, setMapPolylineCoords] = useState<
    Array<MapCoordinate & { accuracy: number; timestamp: string }>
  >([]);

  const [dangerCoords, setDangerCoords] = useState<BackendCoordinate[]>([]);
  const [cautionCoords, setCautionCoords] = useState<BackendCoordinate[]>([]);
  const [currentZone, setCurrentZone] = useState<GeofenceZoneType>("SAFE");
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingVertices, setDrawingVertices] = useState<MapCoordinate[]>([]);
  const [isPlacingCircle, setIsPlacingCircle] = useState(false);
  const [circleRadiusMeters, setCircleRadiusMeters] = useState(100);

  const [llmReport, setLlmReport] = useState<LlmEvaluation | null>(null);
  const [isEvaluatingBreach, setIsEvaluatingBreach] = useState(false);
  const [lastBreachTimestamp, setLastBreachTimestamp] = useState<string | null>(null);
  const [autoencoderOutput, setAutoencoderOutput] = useState<number | number[] | null>(null);
  const [showLlmCard, setShowLlmCard] = useState(true);

  const [removeAccountOpen, setRemoveAccountOpen] = useState(false);
  const [removeAccountPassword, setRemoveAccountPassword] = useState("");
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
  const [removingAccount, setRemovingAccount] = useState(false);

  useEffect(() => {
    dangerCoordsRef.current = dangerCoords;
  }, [dangerCoords]);

  useEffect(() => {
    cautionCoordsRef.current = cautionCoords;
  }, [cautionCoords]);

  const submitWindow = useCallback(async (samples: TrackPoint[]) => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    try {
      const chronologicalSamples = [...samples].sort(
        (first, second) => Date.parse(first.timestamp) - Date.parse(second.timestamp),
      );
      const response: DetectionResponse = await api.sendSamples(chronologicalSamples);

      setRawMseTelemetry(response.mse);
      setCurrentStatus(response.status);
    } catch (error) {
      setCurrentStatus("Idle");
      setTrackingMessage(
        error instanceof Error ? error.message : "Unable to upload telemetry window.",
      );
    } finally {
      requestInFlight.current = false;
    }
  }, []);

  const triggerGeofencePing = useCallback(
    async (
      smoothedLat: number,
      smoothedLng: number,
      targetZone: GeofenceZoneType,
      customDanger?: BackendCoordinate[],
      customCaution?: BackendCoordinate[],
    ) => {
      const danger = customDanger ?? dangerCoordsRef.current;
      const caution = customCaution ?? cautionCoordsRef.current;
      if (danger.length < 3) return;

      setIsEvaluatingBreach(true);
      setShowLlmCard(true);
      const breachTime = new Date().toISOString();
      setLastBreachTimestamp(breachTime);

      try {
        const response = await api.sendGeofencePing({
          lat: smoothedLat,
          long: smoothedLng,
          timestamp: breachTime,
          caution_zone_coords: caution,
          danger_zone_coords: danger,
        });

        const parsed = parseLlmEval(response.llm_eval);
        setLlmReport(parsed);
        setAutoencoderOutput(response["GRU_Autoencoder output"] ?? null);
      } catch (error) {
        setLlmReport({
          risk_category: targetZone === "DANGER" ? "CRITICAL" : "MEDIUM",
          message: `Tourist transitioned into ${targetZone} zone. AI breach log logged on server.`,
          risk_score: targetZone === "DANGER" ? 0.9 : 0.5,
          recommended_actions: "Immediate retreat to safe perimeter required.",
        });
      } finally {
        setIsEvaluatingBreach(false);
      }
    },
    [],
  );

  // Record a location sample strictly every 5 seconds using 2D Geodetic Kalman Filtering
  const recordFiveSecondSample = useCallback(
    (
      rawLat: number,
      rawLng: number,
      accuracy: number,
      timestampMs: number = Date.now(),
      speed?: number | null,
    ) => {
      // Apply 2D Geodetic Kalman Filter
      const smoothed = kalmanFilter.current.update(rawLat, rawLng, accuracy, timestampMs, speed);
      const timestamp = new Date(timestampMs).toISOString();

      const smoothedPoint: MapCoordinate = { lat: smoothed.lat, lng: smoothed.lng };
      currentSmoothedPosRef.current = smoothedPoint;

      const trackPoint: TrackPoint = {
        latitude: smoothed.lat,
        longitude: smoothed.lng,
        timestamp,
      };

      // Memory buffer sliding window pipeline (31 samples)
      trajectoryBuffer.current.push(trackPoint);
      if (trajectoryBuffer.current.length > BUFFER_SIZE) {
        trajectoryBuffer.current.shift();
      }
      setBufferCount(trajectoryBuffer.current.length);

      setMapPolylineCoords((previous) => [
        ...previous.slice(-299),
        {
          lat: smoothed.lat,
          lng: smoothed.lng,
          accuracy: smoothed.accuracy,
          timestamp,
        },
      ]);
      setFilteredAccuracy(smoothed.accuracy);
      setRawAccuracy(accuracy);

      setTrackingMessage(
        trajectoryBuffer.current.length === BUFFER_SIZE
          ? "Memory buffer full (31 samples). Trajectory intelligence streaming."
          : `Buffering points: sample ${trajectoryBuffer.current.length} of ${BUFFER_SIZE} recorded (Kalman smoothed).`,
      );

      if (trajectoryBuffer.current.length === BUFFER_SIZE) {
        void submitWindow([...trajectoryBuffer.current]);
      }

      // Geofence Zone Evaluation & Transition Detection
      if (dangerCoordsRef.current.length >= 3) {
        const detectedZone = evaluateGeofenceZone(
          smoothedPoint,
          dangerCoordsRef.current,
          cautionCoordsRef.current,
        );
        setCurrentZone(detectedZone);

        // Detect Zone Transitions (avoid repeated pings while inside same zone)
        const previousPinged = lastPingedZoneRef.current;
        if (detectedZone === "CAUTION" && previousPinged !== "CAUTION") {
          lastPingedZoneRef.current = "CAUTION";
          void triggerGeofencePing(smoothed.lat, smoothed.lng, "CAUTION");
        } else if (detectedZone === "DANGER" && previousPinged !== "DANGER") {
          lastPingedZoneRef.current = "DANGER";
          void triggerGeofencePing(smoothed.lat, smoothed.lng, "DANGER");
        } else if (detectedZone === "SAFE") {
          lastPingedZoneRef.current = "SAFE";
        }
      }
    },
    [submitWindow, triggerGeofencePing],
  );

  const stopTracking = useCallback(() => {
    if (loggingIntervalId.current !== null) {
      window.clearInterval(loggingIntervalId.current);
      loggingIntervalId.current = null;
    }
    if (geoWatchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(geoWatchId.current);
      geoWatchId.current = null;
    }
    kalmanFilter.current.reset();
    setIsTracking(false);
  }, []);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setTrackingMessage("Location services are not available in this browser.");
      return;
    }
    if (loggingIntervalId.current !== null) return;

    kalmanFilter.current.reset();
    setCurrentStatus("Idle");
    setTrackingMessage(
      "Tracking active: applying 2D Kalman filter & recording samples strictly every 5s…",
    );
    setIsTracking(true);

    // 1. Continuous watchPosition to ensure lowest latency GPS fixes feed the filter
    geoWatchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const now = pos.timestamp || Date.now();
        latestRawGps.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          timestamp: now,
        };
        setRawAccuracy(pos.coords.accuracy);

        // Feed measurement into Kalman filter to continuously refine estimate
        const smoothed = kalmanFilter.current.update(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
          now,
          pos.coords.speed,
        );
        setFilteredAccuracy(smoothed.accuracy);
      },
      (err) => {
        setTrackingMessage(`GPS signal warning: ${err.message}`);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 6000 },
    );

    // Initial fix immediately
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const now = pos.timestamp || Date.now();
        latestRawGps.current = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speed: pos.coords.speed,
          timestamp: now,
        };
        recordFiveSecondSample(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy,
          now,
          pos.coords.speed,
        );
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000 },
    );

    // 2. Strictly 5-second interval timer for memory buffer
    loggingIntervalId.current = window.setInterval(() => {
      if (latestRawGps.current) {
        recordFiveSecondSample(
          latestRawGps.current.lat,
          latestRawGps.current.lng,
          latestRawGps.current.accuracy,
          latestRawGps.current.timestamp,
          latestRawGps.current.speed,
        );
      } else {
        // Fallback request
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const now = pos.timestamp || Date.now();
            latestRawGps.current = {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              speed: pos.coords.speed,
              timestamp: now,
            };
            recordFiveSecondSample(
              pos.coords.latitude,
              pos.coords.longitude,
              pos.coords.accuracy,
              now,
              pos.coords.speed,
            );
          },
          (geoError) => {
            setTrackingMessage(`Location update missed: ${geoError.message}`);
          },
          { enableHighAccuracy: true, timeout: 4500, maximumAge: 2000 },
        );
      }
    }, 5000);
  }, [recordFiveSecondSample]);

  useEffect(() => () => stopTracking(), [stopTracking]);

  // Geofence: Polygon Drawing Actions
  const handleStartDrawPolygon = () => {
    setIsPlacingCircle(false);
    setIsDrawingMode(true);
    setDrawingVertices([]);
  };

  const handleAddDrawingVertex = (coord: MapCoordinate) => {
    setDrawingVertices((prev) => [...prev, coord]);
  };

  const handleUndoDrawingVertex = () => {
    setDrawingVertices((prev) => prev.slice(0, -1));
  };

  const handleCancelDrawing = () => {
    setIsDrawingMode(false);
    setDrawingVertices([]);
  };

  const handleFinishDrawing = () => {
    if (drawingVertices.length < 3) return;
    const danger: BackendCoordinate[] = drawingVertices.map((v) => ({
      lat: Number(v.lat.toFixed(7)),
      long: Number(v.lng.toFixed(7)),
    }));
    // Close polygon
    danger.push({ ...danger[0] });

    // Expand 50m outward for caution zone
    const caution = bufferPolygonMeters(drawingVertices, 50);

    // Synchronously update refs before state updates
    dangerCoordsRef.current = danger;
    cautionCoordsRef.current = caution;
    setDangerCoords(danger);
    setCautionCoords(caution);
    setIsDrawingMode(false);
    setDrawingVertices([]);

    // Determine current user position
    const userPos =
      currentSmoothedPosRef.current ??
      (latestRawGps.current
        ? { lat: latestRawGps.current.lat, lng: latestRawGps.current.lng }
        : null) ??
      (mapPolylineCoords.at(-1)
        ? { lat: mapPolylineCoords.at(-1)!.lat, lng: mapPolylineCoords.at(-1)!.lng }
        : null);

    if (userPos) {
      const zone = evaluateGeofenceZone(userPos, danger, caution);
      setCurrentZone(zone);
      if (zone !== "SAFE") {
        lastPingedZoneRef.current = zone;
        void triggerGeofencePing(userPos.lat, userPos.lng, zone, danger, caution);
      } else {
        lastPingedZoneRef.current = "SAFE";
      }
    } else if (navigator.geolocation) {
      // If position wasn't tracked yet, get current GPS fix immediately and Kalman smooth it
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const smoothed = kalmanFilter.current.update(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.accuracy,
            pos.timestamp || Date.now(),
            pos.coords.speed,
          );
          const p = { lat: smoothed.lat, lng: smoothed.lng };
          currentSmoothedPosRef.current = p;
          const zone = evaluateGeofenceZone(p, danger, caution);
          setCurrentZone(zone);
          if (zone !== "SAFE") {
            lastPingedZoneRef.current = zone;
            void triggerGeofencePing(p.lat, p.lng, zone, danger, caution);
          } else {
            lastPingedZoneRef.current = "SAFE";
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 },
      );
    }
  };

  // Geofence: Circle Mode (Click map to place center)
  const handleStartPlaceCircle = () => {
    setIsDrawingMode(false);
    setDrawingVertices([]);
    setIsPlacingCircle(true);
  };

  const handlePlaceCircleCenter = (center: MapCoordinate) => {
    const danger = generateCircleCoordinates(center.lat, center.lng, circleRadiusMeters);
    const caution = generateCircleCoordinates(center.lat, center.lng, circleRadiusMeters + 50);

    dangerCoordsRef.current = danger;
    cautionCoordsRef.current = caution;
    setDangerCoords(danger);
    setCautionCoords(caution);
    setIsPlacingCircle(false);

    const userPos =
      currentSmoothedPosRef.current ??
      (latestRawGps.current
        ? { lat: latestRawGps.current.lat, lng: latestRawGps.current.lng }
        : null) ??
      (mapPolylineCoords.at(-1)
        ? { lat: mapPolylineCoords.at(-1)!.lat, lng: mapPolylineCoords.at(-1)!.lng }
        : null);

    if (userPos) {
      const zone = evaluateGeofenceZone(userPos, danger, caution);
      setCurrentZone(zone);
      if (zone !== "SAFE") {
        lastPingedZoneRef.current = zone;
        void triggerGeofencePing(userPos.lat, userPos.lng, zone, danger, caution);
      } else {
        lastPingedZoneRef.current = "SAFE";
      }
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const smoothed = kalmanFilter.current.update(
            pos.coords.latitude,
            pos.coords.longitude,
            pos.coords.accuracy,
            pos.timestamp || Date.now(),
            pos.coords.speed,
          );
          const p = { lat: smoothed.lat, lng: smoothed.lng };
          currentSmoothedPosRef.current = p;
          const zone = evaluateGeofenceZone(p, danger, caution);
          setCurrentZone(zone);
          if (zone !== "SAFE") {
            lastPingedZoneRef.current = zone;
            void triggerGeofencePing(p.lat, p.lng, zone, danger, caution);
          } else {
            lastPingedZoneRef.current = "SAFE";
          }
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000 },
      );
    }
  };

  const handleClearGeofence = () => {
    dangerCoordsRef.current = [];
    cautionCoordsRef.current = [];
    setDangerCoords([]);
    setCautionCoords([]);
    setCurrentZone("SAFE");
    lastPingedZoneRef.current = "SAFE";
    setLlmReport(null);
    setIsDrawingMode(false);
    setIsPlacingCircle(false);
  };

  // Account removal handler
  const removeAccount = async () => {
    if (!profile?.email || !removeAccountPassword) return;
    setRemovingAccount(true);
    setAccountMessage(null);
    try {
      const response = await api.removeAccount(profile.email, removeAccountPassword, profile.role);
      if (!response.status) throw new Error(response.message || "Account removal failed.");
      stopTracking();
      onLogout();
    } catch (error) {
      setAccountMessage(error instanceof Error ? error.message : "Account removal failed.");
    } finally {
      setRemovingAccount(false);
    }
  };

  const latestCoordinate = mapPolylineCoords.at(-1);
  const totalDistance = useMemo(
    () =>
      mapPolylineCoords.reduce((total, point, index) => {
        const previous = mapPolylineCoords[index - 1];
        return previous ? total + distanceMeters(previous, point) : total;
      }, 0),
    [mapPolylineCoords],
  );

  const isAnomaly = currentStatus === "Anomaly";
  const isDangerBreach = currentZone === "DANGER";
  const isCautionBreach = currentZone === "CAUTION";
  const hasGeofence = dangerCoords.length >= 3;

  // Header status indicator
  const systemStatusLabel = isDangerBreach
    ? "DANGER ZONE BREACH"
    : isCautionBreach
      ? "CAUTION ZONE (+50M)"
      : isAnomaly
        ? "TRAJECTORY ANOMALY"
        : currentStatus === "Normal"
          ? "SYSTEM NOMINAL"
          : "STANDBY";

  return (
    <div className="min-h-screen">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1480px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/40 bg-primary/15 text-primary shadow-(--shadow-glow-purple)">
              <ShieldCheck className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold sm:text-base">Tourist Safety Monitor</p>
              <p className="hidden font-mono text-[10px] uppercase text-muted-foreground sm:block">
                GPS Trajectory Intelligence & Geofence Guard
              </p>
            </div>
          </div>

          {/* Clean Status Badge without MSE numbers */}
          <span
            className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold sm:ml-2 ${
              isDangerBreach || isAnomaly
                ? "anomaly-marker border-destructive/60 bg-destructive/15 text-destructive"
                : isCautionBreach
                  ? "pulse-marker border-warning/60 bg-warning/15 text-warning"
                  : currentStatus === "Normal"
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-border bg-secondary text-muted-foreground"
            }`}
          >
            {systemStatusLabel}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-right md:block">
              <p className="max-w-52 truncate text-xs font-medium">
                {profile?.email ?? "Unknown user"}
              </p>
              <p className="font-mono text-[9px] uppercase text-muted-foreground">
                {profile?.role ?? "Tourist"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={isTracking}
              onClick={isTracking ? stopTracking : startTracking}
              className={isTracking ? "border-primary/60 bg-primary/15 text-primary" : ""}
            >
              <span
                className={`size-2 rounded-full ${isTracking ? "pulse-marker bg-success" : "bg-muted-foreground"}`}
              />
              <span className="hidden sm:inline">
                {isTracking ? "Stop Tracking" : "Start Tracking"}
              </span>
              <span className="sm:hidden">{isTracking ? "Stop" : "Start"}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onLogout}
              title="Logout"
              aria-label="Logout"
            >
              <LogOut className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setRemoveAccountOpen(true)}
              title="Remove account"
              aria-label="Remove account"
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] px-4 py-5 sm:px-6">
        {/* Real-time Threat Notification Banners */}
        {isDangerBreach && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/60 bg-destructive/15 px-4 py-3 shadow-(--shadow-glow-red)">
            <div className="flex items-center gap-3">
              <ShieldAlert className="anomaly-marker size-5 shrink-0 text-destructive" />
              <div>
                <p className="text-sm font-bold text-destructive">
                  CRITICAL: Danger Zone Perimeter Breached!
                </p>
                <p className="text-xs text-destructive/90">
                  Tourist has entered the designated restricted danger boundary. Immediate action
                  advised.
                </p>
              </div>
            </div>
            {llmReport && !showLlmCard && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-destructive/60 bg-destructive/20 text-destructive hover:bg-destructive/30"
                onClick={() => setShowLlmCard(true)}
              >
                <Eye className="size-3.5 mr-1" /> View AI Report
              </Button>
            )}
          </div>
        )}

        {isCautionBreach && !isDangerBreach && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-warning/60 bg-warning/15 px-4 py-3">
            <div className="flex items-center gap-3">
              <AlertTriangle className="size-5 shrink-0 text-warning" />
              <div>
                <p className="text-sm font-semibold text-warning">
                  WARNING: Caution Zone (+50m Buffer) Breached!
                </p>
                <p className="text-xs text-warning/90">
                  Approaching restricted perimeter. Maintaining safety distance recommended.
                </p>
              </div>
            </div>
            {llmReport && !showLlmCard && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="border-warning/60 bg-warning/20 text-warning hover:bg-warning/30"
                onClick={() => setShowLlmCard(true)}
              >
                <Eye className="size-3.5 mr-1" /> View AI Report
              </Button>
            )}
          </div>
        )}

        {isAnomaly && !isDangerBreach && !isCautionBreach && (
          <div className="mb-5 flex items-center gap-3 rounded-md border border-destructive/60 bg-destructive/10 px-4 py-3 shadow-(--shadow-glow-red)">
            <AlertTriangle className="anomaly-marker size-5 shrink-0 text-destructive" />
            <p className="text-sm font-semibold text-destructive">
              Trajectory Anomaly Detected · AI pattern analysis detected abnormal movement velocity
              or trajectory.
            </p>
          </div>
        )}

        <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          {/* Left Column: Intelligence, Geofence Management, Hardware Telemetry */}
          <section className="space-y-5">
            {/* 1. Security & Trajectory Status */}
            <article className="panel p-5 shadow-(--shadow-panel)">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <Compass className="size-4 text-primary" /> Security & Threat Status
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {/* Trajectory Status */}
                <div className="rounded-lg border border-border/70 bg-secondary/30 p-3">
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">
                    Trajectory AI
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    {isAnomaly ? (
                      <AlertTriangle className="size-5 text-destructive shrink-0" />
                    ) : (
                      <ShieldCheck
                        className={`size-5 shrink-0 ${
                          currentStatus === "Normal" ? "text-success" : "text-muted-foreground"
                        }`}
                      />
                    )}
                    <span
                      className={`text-xs font-bold leading-tight ${
                        isAnomaly
                          ? "text-destructive"
                          : currentStatus === "Normal"
                            ? "text-success"
                            : "text-muted-foreground"
                      }`}
                    >
                      {isAnomaly
                        ? "ANOMALY DETECTED"
                        : currentStatus === "Normal"
                          ? "NOMINAL"
                          : "AWAITING DATA"}
                    </span>
                  </div>
                </div>

                {/* Geofence Perimeter Status */}
                <div className="rounded-lg border border-border/70 bg-secondary/30 p-3">
                  <p className="font-mono text-[10px] uppercase text-muted-foreground">
                    Geofence Perimeter
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    {isDangerBreach ? (
                      <ShieldAlert className="size-5 text-destructive shrink-0 anomaly-marker" />
                    ) : isCautionBreach ? (
                      <AlertTriangle className="size-5 text-warning shrink-0" />
                    ) : (
                      <ShieldCheck
                        className={`size-5 shrink-0 ${hasGeofence ? "text-success" : "text-muted-foreground"}`}
                      />
                    )}
                    <span
                      className={`text-xs font-bold leading-tight ${
                        isDangerBreach
                          ? "text-destructive"
                          : isCautionBreach
                            ? "text-warning"
                            : hasGeofence
                              ? "text-success"
                              : "text-muted-foreground"
                      }`}
                    >
                      {isDangerBreach
                        ? "DANGER BREACH"
                        : isCautionBreach
                          ? "CAUTION ZONE"
                          : hasGeofence
                            ? "PERIMETER CLEAR"
                            : "NO GEOFENCE"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Overall Safety Summary */}
              <div className="mt-4 rounded-md border border-border/50 bg-background/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Active Perimeter: </span>
                {hasGeofence ? (
                  <span>Danger zone active with +50m dynamic caution buffer</span>
                ) : (
                  <span>Draw or place a danger zone on the map to activate safety geofence</span>
                )}
              </div>
            </article>

            {/* 2. AI Incident Evaluation Card (When breach occurs or requested) */}
            {showLlmCard && (isEvaluatingBreach || llmReport) && (
              <LlmEvaluationCard
                evaluation={llmReport}
                zone={currentZone}
                timestamp={lastBreachTimestamp ?? undefined}
                userCoordinate={
                  latestCoordinate
                    ? { lat: latestCoordinate.lat, long: latestCoordinate.lng }
                    : null
                }
                autoencoderOutput={autoencoderOutput}
                isEvaluating={isEvaluatingBreach}
                onDismiss={() => setShowLlmCard(false)}
              />
            )}

            {/* 3. Memory Buffer Pipeline */}
            <article className="panel p-5 shadow-(--shadow-panel)">
              <div className="flex items-center justify-between gap-4">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                  <Radio className="size-4 text-accent" /> Memory Buffer
                </p>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[9px] text-primary">
                    <Activity className="size-3" /> Kalman Active
                  </span>
                  <p className="font-mono text-xs text-primary">
                    {bufferCount} / {BUFFER_SIZE}
                  </p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary shadow-(--shadow-glow-purple) transition-[width] duration-300"
                  style={{ width: `${(bufferCount / BUFFER_SIZE) * 100}%` }}
                />
              </div>
              <div className="mt-3 grid grid-cols-[repeat(31,minmax(0,1fr))] gap-0.5">
                {Array.from({ length: BUFFER_SIZE }).map((_, index) => (
                  <span
                    key={index}
                    className={`h-3 rounded-[1px] ${index < bufferCount ? "bg-accent" : "bg-secondary"}`}
                  />
                ))}
              </div>
              <p className="mt-3 font-mono text-[10px] uppercase text-muted-foreground">
                {trackingMessage ??
                  (isTracking
                    ? "Recording Kalman-smoothed samples strictly every 5 seconds"
                    : "Tracking paused")}
              </p>
            </article>

            {/* 4. Geofence Control & Zone Management */}
            <article className="panel p-5 shadow-(--shadow-panel)">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                  <Layers className="size-4 text-warning" /> Geofence Perimeter Controls
                </p>
                {hasGeofence && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px] text-destructive hover:bg-destructive/15"
                    onClick={handleClearGeofence}
                  >
                    Clear Geofence
                  </Button>
                )}
              </div>

              <div className="mt-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={isDrawingMode ? "default" : "outline"}
                    size="sm"
                    className={`text-xs ${
                      isDrawingMode
                        ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        : ""
                    }`}
                    onClick={isDrawingMode ? handleFinishDrawing : handleStartDrawPolygon}
                  >
                    <Pentagon className="size-3.5 mr-1" />
                    {isDrawingMode ? `Finish (${drawingVertices.length})` : "Draw Danger Zone"}
                  </Button>

                  <Button
                    type="button"
                    variant={isPlacingCircle ? "default" : "outline"}
                    size="sm"
                    className={`text-xs ${
                      isPlacingCircle ? "border-primary/60 bg-primary/20 text-primary" : ""
                    }`}
                    onClick={
                      isPlacingCircle ? () => setIsPlacingCircle(false) : handleStartPlaceCircle
                    }
                  >
                    <Crosshair className="size-3.5 mr-1" />
                    {isPlacingCircle ? "Cancel Place" : "Place Circle Zone"}
                  </Button>
                </div>

                {/* Radius Slider for Circular Geofence */}
                <div className="rounded-md border border-border/60 bg-secondary/20 p-2.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-muted-foreground">Danger Radius:</span>
                    <span className="font-semibold text-foreground">
                      {circleRadiusMeters} m (+50m Caution)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="30"
                    max="500"
                    step="10"
                    value={circleRadiusMeters}
                    onChange={(e) => {
                      const newRadius = Number(e.target.value);
                      setCircleRadiusMeters(newRadius);
                    }}
                    className="mt-2 w-full accent-primary"
                  />
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Click &ldquo;Place Circle Zone&rdquo; then click anywhere on the map to place
                    the danger center.
                  </p>
                </div>
              </div>
            </article>

            {/* 5. Hardware GPS & Kalman Telemetry */}
            <article className="panel p-5 shadow-(--shadow-panel)">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                <Navigation className="size-4 text-accent" /> Hardware &amp; Filter Telemetry
              </p>
              <dl className="mt-4 divide-y divide-border text-sm">
                <Metric
                  icon={<Activity className="text-success" />}
                  label="Kalman Filter"
                  value="2D Geodetic Active"
                />
                <Metric
                  icon={<Navigation />}
                  label="Filtered GPS accuracy"
                  value={
                    filteredAccuracy === null ? "—" : `±${filteredAccuracy.toFixed(1)} m (Smoothed)`
                  }
                />
                <Metric
                  icon={<Crosshair />}
                  label="Raw sensor accuracy"
                  value={rawAccuracy === null ? "—" : `±${rawAccuracy.toFixed(1)} m`}
                />
                <Metric icon={<Timer />} label="Sampling interval" value="Strictly 5.0 s" />
                <Metric
                  icon={<Timer />}
                  label="Last ping"
                  value={
                    latestCoordinate
                      ? new Date(latestCoordinate.timestamp).toLocaleTimeString()
                      : "—"
                  }
                />
                <Metric
                  icon={<RouteIcon />}
                  label="Distance logged"
                  value={
                    totalDistance < 1000
                      ? `${totalDistance.toFixed(0)} m`
                      : `${(totalDistance / 1000).toFixed(2)} km`
                  }
                />
                <Metric
                  icon={<MapPin />}
                  label="Valid points"
                  value={`${mapPolylineCoords.length}`}
                />
              </dl>
            </article>
          </section>

          {/* Right Column: Interactive Vector Map View */}
          <section className="panel relative min-h-[500px] overflow-hidden border-primary/30 shadow-(--shadow-panel) xl:min-h-[760px]">
            <div className="absolute left-4 top-4 z-10 rounded-md border border-primary/30 bg-background/85 px-3 py-2 backdrop-blur">
              <p className="font-mono text-[9px] uppercase text-muted-foreground">
                Interactive Vector Map
              </p>
              <p className="mt-0.5 text-xs font-semibold">
                {isDrawingMode
                  ? "Drawing Danger Zone (Click map points)"
                  : isPlacingCircle
                    ? `Click map to place Circle Center (${circleRadiusMeters}m)`
                    : hasGeofence
                      ? "Active Dynamic Perimeter (+50m buffer)"
                      : "Kalman-Filtered Trajectory Monitoring"}
              </p>
            </div>

            <ClientOnly fallback={<MapFallback />}>
              <Suspense fallback={<MapFallback />}>
                <TrajectoryMap
                  coordinates={mapPolylineCoords}
                  isAnomaly={isAnomaly}
                  zone={currentZone}
                  dangerCoords={dangerCoords}
                  cautionCoords={cautionCoords}
                  isDrawingMode={isDrawingMode}
                  drawingVertices={drawingVertices}
                  onAddDrawingVertex={handleAddDrawingVertex}
                  onFinishDrawing={handleFinishDrawing}
                  onCancelDrawing={handleCancelDrawing}
                  onUndoDrawingVertex={handleUndoDrawingVertex}
                  isPlacingCircle={isPlacingCircle}
                  circleRadiusMeters={circleRadiusMeters}
                  onPlaceCircleCenter={handlePlaceCircleCenter}
                  onCancelPlaceCircle={() => setIsPlacingCircle(false)}
                />
              </Suspense>
            </ClientOnly>

            <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-md border border-border bg-background/85 px-3 py-2 font-mono text-[10px] text-muted-foreground backdrop-blur">
              {latestCoordinate
                ? `${latestCoordinate.lat.toFixed(5)}, ${latestCoordinate.lng.toFixed(5)} (Kalman-filtered)`
                : "Waiting for precision GPS fix"}
            </div>
          </section>
        </div>
      </main>

      {/* Remove Account Modal */}
      {removeAccountOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 px-4 backdrop-blur-sm">
          <div className="panel w-full max-w-md p-6 shadow-(--shadow-panel)">
            <div className="flex items-center gap-3 text-destructive">
              <Trash2 className="size-5" />
              <h2 className="text-base font-semibold text-foreground">Remove account</h2>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              This permanently removes your account and cannot be undone. Enter your password to
              confirm.
            </p>
            <input
              className="mt-4 w-full rounded-md border border-input bg-background/70 px-3 py-2.5 text-sm text-foreground outline-none focus:border-destructive focus:ring-2 focus:ring-destructive/30"
              type="password"
              value={removeAccountPassword}
              onChange={(event) => setRemoveAccountPassword(event.target.value)}
              placeholder="Account password"
              autoFocus
            />
            {accountMessage && <p className="mt-3 text-xs text-destructive">{accountMessage}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRemoveAccountOpen(false);
                  setRemoveAccountPassword("");
                  setAccountMessage(null);
                }}
                disabled={removingAccount}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void removeAccount()}
                disabled={removingAccount || !removeAccountPassword}
              >
                {removingAccount ? "Removing…" : "Remove account"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <dt className="flex items-center gap-2 text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="text-right font-mono text-xs">{value}</dd>
    </div>
  );
}

function MapFallback() {
  return (
    <div className="bg-map flex h-full min-h-[480px] items-center justify-center font-mono text-xs text-muted-foreground">
      Initializing vector map…
    </div>
  );
}
