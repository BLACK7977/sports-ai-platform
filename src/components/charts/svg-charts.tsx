import { probabilityPercentages } from "@/lib/presentation/probability";

export function StandingsBars({
  data,
}: {
  data: Array<{
    name: string;
    short: string;
    value: number;
    max: number;
    metricLabel?: string;
    detail?: string;
    variant?: "goals" | "assists" | "ga";
  }>;
  width?: number;
  height?: number;
}) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.max, d.value)));
  return (
    <div className="standings-tech-bars space-y-2.5 font-mono">
      {data.map((d, i) => {
        const pct = Math.min(100, Math.max(0, Math.round((d.value / max) * 100)));
        const isLeader = i === 0;
        const color = d.variant === "assists"
          ? "bg-violet-400"
          : d.variant === "ga"
            ? "bg-fuchsia-400"
            : "bg-cyan-400";
        const valueColor = d.variant === "assists"
          ? "text-violet-300"
          : d.variant === "ga"
            ? "text-fuchsia-300"
            : "text-cyan-300";
        return (
          <div key={`${d.name}-${i}`} className={`group p-2 rounded bg-slate-900/40 border border-slate-800/60 transition ${d.variant === "assists" ? "hover:border-violet-400/40" : d.variant === "ga" ? "hover:border-fuchsia-400/40" : "hover:border-cyan-500/30"}`}>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <div className="flex items-center gap-2.5">
                <span className={`text-[11px] font-bold w-4 text-center ${isLeader ? "text-cyan-400" : "text-slate-500"}`}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={`font-medium ${isLeader ? `${valueColor} font-semibold` : "text-slate-200"}`}>
                  {d.name}
                </span>
                <span className="text-slate-500 text-[10px] uppercase tracking-wider hidden sm:inline">
                  {d.short}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`font-bold tabular-nums text-sm ${valueColor}`}>
                  {d.value}
                </span>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">{d.metricLabel ?? "VAL"}</span>
              </div>
            </div>
            {d.detail ? <div className="mb-1 text-[10px] font-mono text-slate-500">{d.detail}</div> : null}
            <div className="h-1.5 w-full bg-slate-800/90 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${isLeader ? color : i < 3 ? color.replace("400", "500") : "bg-slate-600"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MatchPointsComparison({
  homeName,
  homeShort,
  homePoints,
  homePosition,
  awayName,
  awayShort,
  awayPoints,
  awayPosition,
  maxPoints = 12,
}: {
  homeName: string;
  homeShort: string;
  homePoints: number;
  homePosition?: number;
  awayName: string;
  awayShort: string;
  awayPoints: number;
  awayPosition?: number;
  maxPoints?: number;
}) {
  const max = Math.max(maxPoints, homePoints, awayPoints, 1);
  const homePct = Math.min(100, Math.max(0, Math.round((homePoints / max) * 100)));
  const awayPct = Math.min(100, Math.max(0, Math.round((awayPoints / max) * 100)));

  return (
    <div className="match-points-comparison-box" aria-label="Comparación de puntos en la tabla">
      <div className="match-points-item">
        <div className="match-points-head">
          <div className="match-points-team">
            <span className="match-points-role match-points-role-home">LOCAL</span>
            <strong>{homeShort || homeName}</strong>
            {homePosition ? <span className="match-points-position">#{homePosition}</span> : null}
          </div>
          <div className="match-points-value">
            <span>{homePoints}</span><small>PTS</small>
          </div>
        </div>
        <div className="match-points-track" aria-hidden="true">
          <div className="match-points-fill match-points-fill-home" style={{ width: `${homePct}%` }}><i /></div>
        </div>
      </div>

      <div className="match-points-item">
        <div className="match-points-head">
          <div className="match-points-team">
            <span className="match-points-role match-points-role-away">VISITA</span>
            <strong>{awayShort || awayName}</strong>
            {awayPosition ? <span className="match-points-position">#{awayPosition}</span> : null}
          </div>
          <div className="match-points-value match-points-value-away">
            <span>{awayPoints}</span><small>PTS</small>
          </div>
        </div>
        <div className="match-points-track" aria-hidden="true">
          <div className="match-points-fill match-points-fill-away" style={{ width: `${awayPct}%` }}><i /></div>
        </div>
      </div>
    </div>
  );
}

export function MatchProbabilityBar({
  homeProb,
  drawProb,
  awayProb,
  homeLabel,
  awayLabel,
}: {
  homeProb: number;
  drawProb: number;
  awayProb: number;
  homeLabel: string;
  awayLabel: string;
}) {
  const percentages = probabilityPercentages({ home: homeProb, draw: drawProb, away: awayProb });
  const homePct = percentages.home;
  const drawPct = percentages.draw;
  const awayPct = percentages.away;

  return (
    <div className="match-prob-wrap space-y-2.5">
      <div className="grid grid-cols-3 text-center font-mono">
        <div className="text-left">
          <div className="text-xs text-slate-400 truncate">{homeLabel}</div>
          <div className="text-lg font-bold text-cyan-400 tabular-nums">{homePct}%</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Empate</div>
          <div className="text-lg font-bold text-slate-300 tabular-nums">{drawPct}%</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-400 truncate">{awayLabel}</div>
          <div className="text-lg font-bold text-sky-400 tabular-nums">{awayPct}%</div>
        </div>
      </div>

      <div className="h-2 w-full flex rounded-full overflow-hidden bg-slate-800/80 gap-0.5 p-0.5">
        <div
          className="h-full bg-cyan-400 rounded-l-full transition-all duration-300"
          style={{ width: `${homePct}%` }}
          title={`${homeLabel}: ${homePct}%`}
        />
        <div
          className="h-full bg-slate-500 transition-all duration-300"
          style={{ width: `${drawPct}%` }}
          title={`Empate: ${drawPct}%`}
        />
        <div
          className="h-full bg-sky-400 rounded-r-full transition-all duration-300"
          style={{ width: `${awayPct}%` }}
          title={`${awayLabel}: ${awayPct}%`}
        />
      </div>
    </div>
  );
}

export function TeamFormStrip({
  form,
  size = 28,
}: {
  form: readonly ("W" | "D" | "L")[];
  size?: number;
}) {
  if (!form.length) {
    return <span className="text-xs text-slate-400">Sin datos</span>;
  }
  const w = form.length * size;
  const h = size;
  const colors: Record<"W" | "D" | "L", string> = {
    W: "#10b981",
    D: "#eab308",
    L: "#ef4444",
  };
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      className="inline-block align-middle"
    >
      {form.map((r, i) => (
        <g key={i}>
          <rect
            x={i * size + 1}
            y={1}
            width={size - 2}
            height={size - 2}
            rx={6}
            fill={colors[r]}
            opacity={0.9}
          />
          <text
            x={i * size + size / 2}
            y={size / 2 + 5}
            textAnchor="middle"
            fontSize={12}
            fontWeight={700}
            fill="white"
          >
            {r}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function PlayerStatsRadar({
  labels,
  values,
  width = 320,
  height = 260,
  label = "Radar",
}: {
  labels: readonly string[];
  values: readonly number[]; // 0..100
  width?: number;
  height?: number;
  label?: string;
}) {
  const cx = width / 2;
  const cy = height / 2;
  const n = labels.length;
  if (n !== values.length || n < 3) {
    return (
      <div className="text-sm text-slate-400">
        Datos insuficientes para radar
      </div>
    );
  }
  const maxR = Math.min(width, height) / 2 - 50;
  const angleFor = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (v: number, i: number) => {
    const r = (maxR * Math.max(0, Math.min(100, v))) / 100;
    const a = angleFor(i);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };

  const rings = [0.25, 0.5, 0.75, 1];
  const polyPath = values
    .map((v, i) => {
      const [x, y] = point(v, i);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ") + " Z";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
      className="block w-full max-w-sm mx-auto h-auto"
    >
      {rings.map((r, ri) => {
        const pts = labels
          .map((_, i) => {
            const a = angleFor(i);
            return `${cx + maxR * r * Math.cos(a)},${
              cy + maxR * r * Math.sin(a)
            }`;
          })
          .join(" ");
        return (
          <polygon
            key={`r-${ri}`}
            points={pts}
            fill="none"
            stroke="#e2e8f0"
          />
        );
      })}
      {labels.map((_, i) => {
        const [x, y] = [
          cx + maxR * Math.cos(angleFor(i)),
          cy + maxR * Math.sin(angleFor(i)),
        ];
        return (
          <line
            key={`a-${i}`}
            x1={cx}
            y1={cy}
            x2={x}
            y2={y}
            stroke="#e2e8f0"
          />
        );
      })}
      <path d={polyPath} fill="#6366f155" stroke="#6366f1" strokeWidth={2} />
      {labels.map((l, i) => {
        const [x, y] = [
          cx + (maxR + 18) * Math.cos(angleFor(i)),
          cy + (maxR + 18) * Math.sin(angleFor(i)) + 4,
        ];
        return (
          <text
            key={`l-${i}`}
            x={x}
            y={y}
            fontSize={11}
            textAnchor="middle"
            fill="#334155"
            fontWeight={500}
          >
            {l}
          </text>
        );
      })}
      {values.map((v, i) => {
        const [x, y] = point(v, i);
        return <circle key={`p-${i}`} cx={x} cy={y} r={3} fill="#6366f1" />;
      })}
    </svg>
  );
}

export function MiniGauge({
  value,
  max = 100,
  label,
  tone = "primary",
}: {
  value: number;
  max?: number;
  label?: string;
  tone?: "primary" | "success" | "warning" | "danger";
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const w = 120;
  const h = 8;
  const colors: Record<typeof tone, string> = {
    primary: "#00e5ff",
    success: "#10b981",
    warning: "#f59e0b",
    danger: "#ef4444",
  };
  return (
    <div className="inline-flex flex-col gap-1 w-full">
      {label ? (
        <div className="text-xs text-slate-400 flex justify-between w-full font-mono">
          <span className="truncate">{label}</span>
          <span className="font-semibold text-slate-200 tabular-nums ml-1">
            {Math.round(value)}%
          </span>
        </div>
      ) : null}
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="w-full h-auto">
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          rx={h / 2}
          fill="rgba(255, 255, 255, 0.1)"
        />
        <rect
          x={0}
          y={0}
          width={w * pct}
          height={h}
          rx={h / 2}
          fill={colors[tone]}
        />
      </svg>
    </div>
  );
}
