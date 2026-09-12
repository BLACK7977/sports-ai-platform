export function StandingsBars({
  data,
  width = 520,
  height = 340,
}: {
  data: Array<{
    name: string;
    short: string;
    value: number;
    max: number;
  }>;
  width?: number;
  height?: number;
}) {
  const padLeft = 100;
  const padRight = 40;
  const padTop = 20;
  const padBottom = 28;
  const usableW = width - padLeft - padRight;
  const usableH = height - padTop - padBottom;
  const barGap = 8;
  const n = data.length || 1;
  const barH = Math.max(8, (usableH - barGap * (n - 1)) / n);
  const max = Math.max(1, ...data.map((d) => Math.max(d.max, d.value)));
  const gridTicks = 5;

  const colorFor = (i: number) => {
    if (i === 0) return "#6366f1";
    if (i === 1) return "#8b5cf6";
    if (i === 2) return "#ec4899";
    return "#38bdf8";
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Gráfico de barras de puntos por equipo"
      className="w-full h-auto"
    >
      {Array.from({ length: gridTicks + 1 }).map((_, i) => {
        const x = padLeft + (usableW * i) / gridTicks;
        const val = Math.round((max * i) / gridTicks);
        return (
          <g key={`g-${i}`}>
            <line
              x1={x}
              x2={x}
              y1={padTop}
              y2={padTop + usableH}
              stroke="#e2e8f0"
              strokeDasharray="3 3"
            />
            <text
              x={x}
              y={height - 8}
              fontSize={10}
              textAnchor="middle"
              fill="#94a3b8"
            >
              {val}
            </text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const y = padTop + i * (barH + barGap);
        const w = (usableW * d.value) / max;
        return (
          <g key={`b-${d.name}-${i}`}>
            <text
              x={padLeft - 8}
              y={y + barH / 2 + 4}
              fontSize={12}
              textAnchor="end"
              fill="#334155"
              fontWeight={600}
            >
              {d.short || d.name}
            </text>
            <rect
              x={padLeft}
              y={y}
              width={usableW}
              height={barH}
              rx={4}
              fill="#f1f5f9"
            />
            <rect
              x={padLeft}
              y={y}
              width={w}
              height={barH}
              rx={4}
              fill={colorFor(i)}
            />
            <text
              x={padLeft + w + 6}
              y={y + barH / 2 + 4}
              fontSize={11}
              fill="#0f172a"
              fontWeight={600}
            >
              {d.value}
            </text>
          </g>
        );
      })}
    </svg>
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
  height = 320,
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
      className="w-full h-auto"
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
    primary: "#6366f1",
    success: "#10b981",
    warning: "#eab308",
    danger: "#ef4444",
  };
  return (
    <div className="inline-flex flex-col gap-1">
      {label ? (
        <div className="text-xs text-slate-500 flex justify-between w-full">
          <span>{label}</span>
          <span className="font-medium text-slate-700">
            {Math.round(value)} / {max}
          </span>
        </div>
      ) : null}
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h}>
        <rect
          x={0}
          y={0}
          width={w}
          height={h}
          rx={h / 2}
          fill="#e2e8f0"
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
