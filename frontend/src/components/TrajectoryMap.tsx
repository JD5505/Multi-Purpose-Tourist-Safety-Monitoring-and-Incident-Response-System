import Map, {
  Layer,
  Marker,
  NavigationControl,
  Source,
  type MapLayerMouseEvent,
  type MapRef,
} from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";
import { useEffect, useMemo, useRef } from "react";
import type { FeatureCollection, LineString, Polygon } from "geojson";
import { Check, LocateFixed, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BackendCoordinate, GeofenceZoneType, MapCoordinate } from "@/lib/trajectory-types";

const mapboxToken = import.meta.env["VITE_MAPBOX_ACCESS_TOKEN"] as string | undefined;

export interface TrajectoryMapProps {
  coordinates: Array<MapCoordinate & { accuracy?: number; timestamp?: string }>;
  isAnomaly: boolean;
  zone?: GeofenceZoneType;
  dangerCoords?: BackendCoordinate[];
  cautionCoords?: BackendCoordinate[];
  isDrawingMode?: boolean;
  drawingVertices?: MapCoordinate[];
  onAddDrawingVertex?: (coord: MapCoordinate) => void;
  onFinishDrawing?: () => void;
  onCancelDrawing?: () => void;
  onUndoDrawingVertex?: () => void;
  isPlacingCircle?: boolean;
  circleRadiusMeters?: number;
  onPlaceCircleCenter?: (coord: MapCoordinate) => void;
  onCancelPlaceCircle?: () => void;
  onRecenter?: () => void;
}

export default function TrajectoryMap({
  coordinates,
  isAnomaly,
  zone = "SAFE",
  dangerCoords = [],
  cautionCoords = [],
  isDrawingMode = false,
  drawingVertices = [],
  onAddDrawingVertex,
  onFinishDrawing,
  onCancelDrawing,
  onUndoDrawingVertex,
  isPlacingCircle = false,
  circleRadiusMeters = 100,
  onPlaceCircleCenter,
  onCancelPlaceCircle,
  onRecenter,
}: TrajectoryMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const latest = coordinates.at(-1);
  const center = latest ?? { lat: 20.5937, lng: 78.9629 };

  const polylineGeoJson = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: "FeatureCollection",
      features:
        coordinates.length > 1
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "LineString",
                  coordinates: coordinates.map((point) => [point.lng, point.lat]),
                },
              },
            ]
          : [],
    }),
    [coordinates],
  );

  const dangerGeoJson = useMemo<FeatureCollection<Polygon>>(() => {
    if (dangerCoords.length < 3) return { type: "FeatureCollection", features: [] };
    const ring = dangerCoords.map((c) => [c.long, c.lat]);
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push(ring[0]);
    }
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [ring],
          },
        },
      ],
    };
  }, [dangerCoords]);

  const cautionGeoJson = useMemo<FeatureCollection<Polygon>>(() => {
    if (cautionCoords.length < 3) return { type: "FeatureCollection", features: [] };
    const ring = cautionCoords.map((c) => [c.long, c.lat]);
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      ring.push(ring[0]);
    }
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [ring],
          },
        },
      ],
    };
  }, [cautionCoords]);

  const drawingLineGeoJson = useMemo<FeatureCollection<LineString>>(() => {
    if (drawingVertices.length < 2) return { type: "FeatureCollection", features: [] };
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: drawingVertices.map((v) => [v.lng, v.lat]),
          },
        },
      ],
    };
  }, [drawingVertices]);

  useEffect(() => {
    if (mapRef.current && latest && !isDrawingMode && !isPlacingCircle) {
      mapRef.current.flyTo({ center: [latest.lng, latest.lat], duration: 900 });
    }
  }, [latest, isDrawingMode, isPlacingCircle]);

  const handleMapClick = (event: MapLayerMouseEvent) => {
    const { lng, lat } = event.lngLat;
    if (isDrawingMode && onAddDrawingVertex) {
      onAddDrawingVertex({ lat, lng });
    } else if (isPlacingCircle && onPlaceCircleCenter) {
      onPlaceCircleCenter({ lat, lng });
    }
  };

  const handleRecenter = () => {
    if (mapRef.current && latest) {
      mapRef.current.flyTo({ center: [latest.lng, latest.lat], zoom: 16, duration: 800 });
    }
    if (onRecenter) onRecenter();
  };

  if (!mapboxToken) return <MapMessage>Mapbox access token is not configured.</MapMessage>;

  const isDanger = zone === "DANGER";
  const isCaution = zone === "CAUTION";
  const isAlerting = isAnomaly || isDanger;

  return (
    <div className="relative h-full w-full">
      <Map
        ref={mapRef}
        mapboxAccessToken={mapboxToken}
        initialViewState={{ longitude: center.lng, latitude: center.lat, zoom: latest ? 15 : 3 }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        reuseMaps
        attributionControl={false}
        onClick={handleMapClick}
        cursor={isDrawingMode || isPlacingCircle ? "crosshair" : "grab"}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="bottom-right" showCompass={false} />

        {}
        <Source id="caution-zone" type="geojson" data={cautionGeoJson}>
          <Layer
            id="caution-zone-fill"
            type="fill"
            paint={{
              "fill-color": "#f59e0b",
              "fill-opacity": 0.16,
            }}
          />
          <Layer
            id="caution-zone-outline"
            type="line"
            paint={{
              "line-color": "#f59e0b",
              "line-width": 2,
              "line-dasharray": [3, 2],
            }}
          />
        </Source>

        {}
        <Source id="danger-zone" type="geojson" data={dangerGeoJson}>
          <Layer
            id="danger-zone-fill"
            type="fill"
            paint={{
              "fill-color": "#ef4444",
              "fill-opacity": 0.28,
            }}
          />
          <Layer
            id="danger-zone-outline"
            type="line"
            paint={{
              "line-color": "#ef4444",
              "line-width": 2.5,
            }}
          />
        </Source>

        {}
        <Source id="drawing-line" type="geojson" data={drawingLineGeoJson}>
          <Layer
            id="drawing-line-layer"
            type="line"
            paint={{
              "line-color": "#ef4444",
              "line-width": 2.5,
              "line-dasharray": [2, 1],
            }}
          />
        </Source>

        {}
        <Source id="trajectory" type="geojson" data={polylineGeoJson}>
          <Layer
            id="trajectory-line"
            type="line"
            paint={{
              "line-color": "#a855f7",
              "line-width": 4,
              "line-join": "round",
              "line-opacity": 0.9,
            }}
          />
        </Source>

        {}
        {isDrawingMode &&
          drawingVertices.map((vertex, index) => (
            <Marker key={index} longitude={vertex.lng} latitude={vertex.lat} anchor="center">
              <div className="flex size-4 items-center justify-center rounded-full border-2 border-white bg-destructive shadow-md">
                <span className="font-mono text-[8px] font-bold text-white">{index + 1}</span>
              </div>
            </Marker>
          ))}

        {}
        {latest && (
          <Marker longitude={latest.lng} latitude={latest.lat} anchor="center">
            <div
              className={`relative flex size-5 items-center justify-center rounded-full border-2 border-white transition-colors duration-300 ${
                isAlerting
                  ? "anomaly-marker bg-destructive shadow-[0_0_24px_8px_rgba(239,68,68,0.55)]"
                  : isCaution
                    ? "pulse-marker bg-warning shadow-[0_0_20px_6px_rgba(245,158,11,0.5)]"
                    : "pulse-marker bg-success shadow-[0_0_20px_6px_rgba(34,197,94,0.35)]"
              }`}
            >
              <span className="size-1.5 rounded-full bg-white" />
            </div>
          </Marker>
        )}
      </Map>

      {/* Floating Drawing Control Overlay (Polygon) */}
      {isDrawingMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/60 bg-background/90 px-4 py-2 shadow-lg backdrop-blur">
          <p className="font-mono text-xs font-semibold text-destructive">
            Click map to place Danger vertices ({drawingVertices.length} placed)
          </p>
          <div className="flex items-center gap-1.5 ml-2">
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-7 bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs px-2.5"
              onClick={onFinishDrawing}
              disabled={drawingVertices.length < 3}
            >
              <Check className="size-3.5 mr-1" /> Finish Zone
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs px-2"
              onClick={onUndoDrawingVertex}
              disabled={drawingVertices.length === 0}
            >
              <RotateCcw className="size-3.5 mr-1" /> Undo
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
              onClick={onCancelDrawing}
            >
              <X className="size-3.5 mr-1" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Floating Circle Placement Overlay */}
      {isPlacingCircle && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center gap-3 rounded-lg border border-primary/60 bg-background/90 px-4 py-2 shadow-lg backdrop-blur">
          <p className="font-mono text-xs font-semibold text-primary">
            Click anywhere on the map to place Danger Zone center ({circleRadiusMeters} m radius)
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
            onClick={onCancelPlaceCircle}
          >
            <X className="size-3.5 mr-1" /> Cancel
          </Button>
        </div>
      )}

      {/* Perimeter Legend (Shifted to Top-Left) */}
      <div className="pointer-events-none absolute top-16 left-4 z-10 hidden rounded-md border border-border/80 bg-background/85 px-3 py-2 text-[10px] backdrop-blur sm:block">
        <p className="font-mono uppercase font-semibold text-muted-foreground mb-1">
          Perimeter Legend
        </p>
        <div className="space-y-1 font-mono">
          <div className="flex items-center gap-2">
            <span className="inline-block size-2.5 rounded-sm bg-destructive/60 border border-destructive" />
            <span>Danger Zone (Restricted)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block size-2.5 rounded-sm bg-warning/40 border border-dashed border-warning" />
            <span>Caution Zone (+50m buffer)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-1 w-2.5 rounded bg-purple-500" />
            <span>Trajectory Path</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block size-2 rounded-full bg-success border border-white" />
            <span>User Location</span>
          </div>
        </div>
      </div>

      {/* Google Maps Style Recenter Button (In place of old legend at Bottom-Right) */}
      <button
        type="button"
        onClick={handleRecenter}
        className="absolute bottom-24 right-2.5 z-20 flex size-9 items-center justify-center rounded-md border border-border/80 bg-background/90 text-foreground shadow-md backdrop-blur transition-all hover:bg-secondary hover:text-primary active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary/40 sm:bottom-24 sm:right-3.5"
        title="Recenter on my location"
        aria-label="Recenter on my location"
      >
        <LocateFixed className="size-4" />
      </button>
    </div>
  );
}

function MapMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[480px] items-center justify-center bg-[#0f0919] px-6 text-center font-mono text-xs text-slate-500">
      {children}
    </div>
  );
}
