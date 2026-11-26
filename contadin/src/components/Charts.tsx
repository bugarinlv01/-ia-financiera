import { useState } from "react";
import { MonthlyCashPoint } from "../types/finance";
import { CashFlowPoint, formatMXN } from "../utils/financeEngine";

interface IncomeExpenseChartProps {
  data: MonthlyCashPoint[];
}

export function IncomeExpenseChart({ data }: IncomeExpenseChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 640;
  const height = 250;
  const padLeft = 72;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 34;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxVal = Math.max(
    100000,
    ...data.flatMap((d) => [d.ingresos, d.egresos])
  );
  const yMax = Math.ceil(maxVal / 200000) * 200000;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => yMax * t);

  const groupW = plotW / Math.max(1, data.length);
  const barW = Math.min(26, groupW * 0.28);
  const gap = 6;

  return (
    <div className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible select-none"
        role="img"
        aria-label="Gráfica mensual de ingresos y egresos en pesos mexicanos"
      >
        {ticks.map((tick, idx) => {
          const y = padTop + plotH - (tick / yMax) * plotH;
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="#E2E8F0"
                strokeDasharray={idx === 0 ? undefined : "3 3"}
              />
              <text
                x={padLeft - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 text-[11px] font-mono-nums"
              >
                ${Math.round(tick / 1000)}k
              </text>
            </g>
          );
        })}

        {data.map((d, i) => {
          const centerX = padLeft + groupW * i + groupW / 2;
          const incH = (d.ingresos / yMax) * plotH;
          const expH = (d.egresos / yMax) * plotH;
          const isHovered = hoveredIdx === i;

          return (
            <g
              key={d.month}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="cursor-pointer"
            >
              {isHovered && (
                <rect
                  x={padLeft + groupW * i + 4}
                  y={padTop}
                  width={groupW - 8}
                  height={plotH}
                  rx={6}
                  fill="#F1F5F9"
                />
              )}
              <rect
                x={centerX - barW - gap / 2}
                y={padTop + plotH - incH}
                width={barW}
                height={Math.max(2, incH)}
                rx={4}
                fill={isHovered ? "#1D4ED8" : "#2563EB"}
              />
              <rect
                x={centerX + gap / 2}
                y={padTop + plotH - expH}
                width={barW}
                height={Math.max(2, expH)}
                rx={4}
                fill={isHovered ? "#0B1F3A" : "#64748B"}
              />
              <text
                x={centerX}
                y={height - 10}
                textAnchor="middle"
                className={`text-[11px] font-medium ${
                  isHovered ? "fill-slate-900" : "fill-slate-500"
                }`}
              >
                {d.month}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 px-1">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#2563EB]" />
            Ingresos
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-[#64748B]" />
            Egresos
          </span>
        </div>

        {hoveredIdx !== null && data[hoveredIdx] ? (
          <div className="font-mono-nums text-slate-800">
            {data[hoveredIdx].month}:{" "}
            <span className="text-blue-700 font-medium">
              +{formatMXN(data[hoveredIdx].ingresos, false)}
            </span>{" "}
            ·{" "}
            <span className="text-slate-700 font-medium">
              -{formatMXN(data[hoveredIdx].egresos, false)}
            </span>{" "}
            · Neto:{" "}
            <span className="font-semibold">
              {formatMXN(
                data[hoveredIdx].ingresos - data[hoveredIdx].egresos,
                false
              )}
            </span>
          </div>
        ) : (
          <span className="text-slate-400">
            Pasa el cursor sobre un mes para ver el detalle
          </span>
        )}
      </div>
    </div>
  );
}

interface CashFlowProjectionChartProps {
  points: CashFlowPoint[];
  threshold: number;
}

export function CashFlowProjectionChart({
  points,
  threshold,
}: CashFlowProjectionChartProps) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (points.length === 0) {
    return (
      <div className="h-60 flex items-center justify-center text-sm text-slate-500">
        No hay movimientos programados para proyectar en este periodo.
      </div>
    );
  }

  const width = 760;
  const height = 270;
  const padLeft = 78;
  const padRight = 24;
  const padTop = 22;
  const padBottom = 36;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const balances = points.map((p) => p.balance);
  const rawMin = Math.min(0, threshold, ...balances);
  const rawMax = Math.max(threshold * 1.5, ...balances, 200000);
  const yMin = Math.floor(rawMin / 100000) * 100000;
  const yMax = Math.ceil(rawMax / 100000) * 100000;
  const range = Math.max(100000, yMax - yMin);

  const toX = (idx: number) =>
    padLeft + (points.length === 1 ? plotW / 2 : (idx / (points.length - 1)) * plotW);
  const toY = (val: number) => padTop + plotH - ((val - yMin) / range) * plotH;

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${toX(i)} ${toY(p.balance)}`)
    .join(" ");

  const zeroY = toY(0);
  const thresholdY = toY(threshold);
  const areaPath = `${linePath} L ${toX(points.length - 1)} ${Math.min(
    padTop + plotH,
    zeroY
  )} L ${toX(0)} ${Math.min(padTop + plotH, zeroY)} Z`;

  const gridSteps = 4;
  const yTicks = Array.from({ length: gridSteps + 1 }, (_, i) => yMin + (range / gridSteps) * i);
  const activePoint = activeIdx !== null ? points[activeIdx] : points[points.length - 1];

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible select-none"
        role="img"
        aria-label="Proyección de flujo de efectivo en pesos mexicanos"
      >
        <defs>
          <linearGradient id="cashflowArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2563EB" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {yTicks.map((tick, idx) => {
          const y = toY(tick);
          return (
            <g key={idx}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke={Math.abs(tick) < 1 ? "#94A3B8" : "#E2E8F0"}
                strokeDasharray={Math.abs(tick) < 1 ? undefined : "3 3"}
              />
              <text
                x={padLeft - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 text-[11px] font-mono-nums"
              >
                ${Math.round(tick / 1000)}k
              </text>
            </g>
          );
        })}

        {threshold > yMin && threshold < yMax && (
          <g>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={thresholdY}
              y2={thresholdY}
              stroke="#D97706"
              strokeDasharray="5 4"
              strokeWidth={1.25}
            />
            <text
              x={width - padRight}
              y={thresholdY - 6}
              textAnchor="end"
              className="fill-amber-700 text-[10px] font-medium"
            >
              Reserva mínima ({formatMXN(threshold, false)})
            </text>
          </g>
        )}

        <path d={areaPath} fill="url(#cashflowArea)" />
        <path
          d={linePath}
          fill="none"
          stroke="#2563EB"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, i) => {
          const cx = toX(i);
          const cy = toY(p.balance);
          const isLow = p.balance < threshold;
          const isNeg = p.balance < 0;
          const isSelected = activeIdx === i;
          const showLabel =
            points.length <= 10 || i === 0 || i === points.length - 1 || i % 2 === 0;

          return (
            <g
              key={p.date}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => setActiveIdx(i)}
              className="cursor-pointer"
            >
              <circle cx={cx} cy={cy} r={14} fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 5.5 : 3.5}
                fill={isNeg ? "#DC2626" : isLow ? "#D97706" : "#2563EB"}
                stroke="#FFFFFF"
                strokeWidth={2}
              />
              {showLabel && (
                <text
                  x={cx}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-slate-500 text-[10px]"
                >
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {activePoint && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-medium text-slate-900">
              Corte {activePoint.label} ({activePoint.date})
            </span>
            <span className="text-slate-300">·</span>
            <span className="font-mono-nums font-semibold text-slate-900">
              Saldo proyectado:{" "}
              <span
                className={
                  activePoint.balance < 0
                    ? "text-red-600"
                    : activePoint.balance < threshold
                    ? "text-amber-700"
                    : "text-blue-700"
                }
              >
                {formatMXN(activePoint.balance)}
              </span>
            </span>
          </div>
          <div className="text-slate-500 truncate max-w-full">
            {activePoint.events.length > 0
              ? activePoint.events.slice(0, 2).join(" · ")
              : "Sin vencimientos en este corte"}
          </div>
        </div>
      )}
    </div>
  );
}
