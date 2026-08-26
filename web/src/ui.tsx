import type { CSSProperties, ReactNode } from "react";
import type { SLAInfo, SLAState } from "./api";
import { formatMinutes, initials, prettyLabel, slaLabel } from "./format";

const AVATAR_TONES = [
  { background: "#d8efe8", color: "#0f766e" },
  { background: "#e4eef6", color: "#1e4a6b" },
  { background: "#f3e6d8", color: "#9a3412" },
  { background: "#ece7f6", color: "#5b3d8f" },
] as const;

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const tone = AVATAR_TONES[name.length % AVATAR_TONES.length] ?? AVATAR_TONES[0];
  const style: CSSProperties = {
    background: tone?.background,
    color: tone?.color,
  };
  return (
    <span className={`avatar avatar-${size}`} style={style} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function Badge({ value, kind }: { value: string; kind?: string }) {
  return <span className={`badge ${kind ?? value}`}>{prettyLabel(value)}</span>;
}

export function SlaChip({ sla }: { sla: SLAInfo }) {
  const label = slaLabel(sla);
  const className = label.state === "MET" ? "MET" : label.state;
  const prefix =
    label.state === "BREACHED" ? "Breached" : label.state === "MET" ? "Met" : `${prettyLabel(label.state)} · ${label.text}`;
  return (
    <span className={`sla-chip ${className}`}>
      <span className="sla-dot" />
      {prefix}
    </span>
  );
}

function ringFill(state: SLAState | "MET"): string {
  if (state === "BREACHED") {
    return "conic-gradient(var(--danger) 0 100%)";
  }
  if (state === "AT_RISK") {
    return "conic-gradient(var(--warn) 0 82%, #e4ece8 82% 100%)";
  }
  if (state === "MET") {
    return "conic-gradient(var(--ok) 0 100%)";
  }
  return "conic-gradient(var(--ok) 0 42%, #e4ece8 42% 100%)";
}

export function SlaRing({ sla }: { sla: SLAInfo }) {
  const label = slaLabel(sla);
  return (
    <span
      className={`sla-ring ${label.state}`}
      style={{ background: ringFill(label.state) }}
      title={label.state === "MET" ? "Met" : `${prettyLabel(label.state)} ${label.text}`}
    >
      <span>{label.state === "BREACHED" ? "!" : label.state === "MET" ? "✓" : (label.text.split(" ")[0] ?? label.text)}</span>
    </span>
  );
}

export function SlaMeter({
  title,
  state,
  remainingMinutes,
  dueAt,
  completed,
  dueLabel,
}: {
  title: string;
  state: SLAState;
  remainingMinutes: number;
  dueAt: string;
  completed: boolean;
  dueLabel: string;
}) {
  return (
    <div className={`sla-meter ${state}`}>
      <div className="sla-meter-head">
        <span>{title}</span>
        <span className={`badge ${state}`}>{prettyLabel(state)}</span>
      </div>
      <div className="sla-track" aria-hidden="true">
        <span className={`sla-fill ${completed ? "frozen" : ""}`} />
      </div>
      <p className="muted">
        {completed
          ? `Clock frozen · ${state === "BREACHED" ? "missed" : "met"} ${dueLabel}`
          : `${formatMinutes(remainingMinutes)} remaining · due ${dueLabel}`}
      </p>
      <p className="muted">{new Date(dueAt).toLocaleString()}</p>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-mark">◎</div>
      <h3>{title}</h3>
      <p className="muted">{body}</p>
      {action}
    </div>
  );
}
