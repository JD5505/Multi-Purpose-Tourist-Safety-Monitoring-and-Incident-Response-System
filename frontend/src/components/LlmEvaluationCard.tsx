import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import type { BackendCoordinate, GeofenceZoneType, LlmEvaluation } from "@/lib/trajectory-types";

interface LlmEvaluationCardProps {
  evaluation: LlmEvaluation | null;
  zone: GeofenceZoneType;
  timestamp?: string;
  userCoordinate?: BackendCoordinate | null;
  autoencoderOutput?: number | number[] | null;
  isEvaluating?: boolean;
  onDismiss?: () => void;
}

export default function LlmEvaluationCard({
  evaluation,
  zone,
  timestamp,
  userCoordinate,
  autoencoderOutput,
  isEvaluating,
  onDismiss,
}: LlmEvaluationCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isEvaluating) {
    return (
      <div className="panel animate-pulse border-warning/50 bg-warning/10 p-4 shadow-(--shadow-panel)">
        <div className="flex items-center gap-3 text-warning">
          <AlertCircle className="size-5 shrink-0 animate-spin" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              Perimeter Breach Detected — AI Analyzing Incident
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              Executing dual LLM evaluation chain...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!evaluation && zone === "SAFE") return null;

  const category = evaluation?.risk_category?.toUpperCase() ?? "UNKNOWN";
  const isCritical = category === "CRITICAL" || zone === "DANGER";
  const isHigh = category === "HIGH";
  const isMedium = category === "MEDIUM" || zone === "CAUTION";

  const badgeColor = isCritical
    ? "border-destructive/60 bg-destructive/15 text-destructive"
    : isHigh
      ? "border-amber-500/60 bg-amber-500/15 text-amber-400"
      : isMedium
        ? "border-warning/60 bg-warning/15 text-warning"
        : "border-success/60 bg-success/15 text-success";

  const cardBorder = isCritical
    ? "border-destructive/60 bg-destructive/5 shadow-(--shadow-glow-red)"
    : isHigh || isMedium
      ? "border-warning/60 bg-warning/5"
      : "border-success/40 bg-success/5";

  let scorePercent: number | null = null;
  if (evaluation?.risk_score !== undefined && evaluation.risk_score !== null) {
    const rawVal = parseFloat(String(evaluation.risk_score).replace(/[^0-9.]/g, ""));
    if (!isNaN(rawVal)) {
      scorePercent = rawVal <= 1 ? rawVal * 100 : Math.min(rawVal, 100);
    }
  }

  const formattedTime = timestamp
    ? new Date(timestamp).toLocaleTimeString()
    : new Date().toLocaleTimeString();

  return (
    <article className={`panel overflow-hidden transition-all ${cardBorder}`}>
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 bg-secondary/40 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {isCritical ? (
            <ShieldAlert className="anomaly-marker size-5 shrink-0 text-destructive" />
          ) : isHigh || isMedium ? (
            <AlertTriangle className="size-5 shrink-0 text-warning" />
          ) : (
            <CheckCircle2 className="size-5 shrink-0 text-success" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              AI Incident Evaluation & Threat Analysis
            </h3>
            <p className="font-mono text-[10px] uppercase text-muted-foreground">
              Breach incident · {formattedTime} · {zone} ZONE
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wider ${badgeColor}`}
          >
            {category} RISK
          </span>
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={isCollapsed ? "Expand report" : "Collapse report"}
          >
            {isCollapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </button>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
              aria-label="Dismiss alert"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="space-y-4 p-4 text-sm">
          {/* Risk Score Progress */}
          {scorePercent !== null && (
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono uppercase text-muted-foreground">
                  Assessed Threat Level
                </span>
                <span className="font-mono font-semibold text-foreground">
                  {scorePercent.toFixed(0)}%
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    isCritical
                      ? "bg-destructive shadow-(--shadow-glow-red)"
                      : isHigh || isMedium
                        ? "bg-warning"
                        : "bg-success"
                  }`}
                  style={{ width: `${scorePercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Assessment Message */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Condition & Perimeter Assessment
            </p>
            <div className="mt-1 rounded-md border border-border/60 bg-background/50 p-3 leading-relaxed text-foreground">
              {evaluation?.message ||
                "Tourist breached designated safe boundary. Immediate monitoring recommended."}
            </div>
          </div>

          {/* Recommended Actions */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Recommended Protocol
            </p>
            <div className="mt-1 flex items-start gap-2.5 rounded-md border border-primary/30 bg-primary/10 p-3 text-primary-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="text-xs leading-relaxed text-foreground font-medium">
                {evaluation?.recommended_actions ||
                  "Retreat to the safe perimeter immediately and establish contact with station authority."}
              </div>
            </div>
          </div>

          {/* Incident Telemetry */}
          <div className="grid grid-cols-1 gap-2 pt-1 font-mono text-[11px] sm:grid-cols-2">
            {autoencoderOutput !== undefined && autoencoderOutput !== null && (
              <div className="flex items-center gap-1.5 rounded border border-border/50 bg-secondary/30 px-2.5 py-1.5 text-muted-foreground">
                <Cpu className="size-3.5 text-primary shrink-0" />
                <span className="truncate">
                  Model Output:{" "}
                  {typeof autoencoderOutput === "number" ? autoencoderOutput.toFixed(4) : "Tensor"}
                </span>
              </div>
            )}
            {userCoordinate && (
              <div className="sm:col-span-2 flex items-center justify-between rounded border border-border/50 bg-secondary/30 px-2.5 py-1.5 text-muted-foreground">
                <span>Breach Location</span>
                <span className="text-foreground">
                  {userCoordinate.lat.toFixed(6)}, {userCoordinate.long.toFixed(6)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
