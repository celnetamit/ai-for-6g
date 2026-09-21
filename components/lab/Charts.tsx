import React from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts';
import { useTheme } from '../../context/ThemeContext';
import type { OptimizerResult } from '../../lib/optimizers';
import type { SweepPoint } from '../../lib/semantic';
import type { LatencyBudget } from '../../lib/performance';
import type { UserResult } from '../../lib/experiment';

/**
 * Every chart in the lab.
 *
 * Collected in one module so that recharts — which is large, and drags a state
 * library in with it — lands in a single lazily-loaded chunk rather than being
 * pulled into the entry bundle by whichever page imports it first.
 *
 * Colour is assigned by *identity*, in a fixed slot order that never changes
 * with the number of series on screen: "Via the IRS" is slot 1 in every chart
 * it appears in, whether there are two series or five. Palette validated for
 * both themes (lightness band, chroma floor, colour-vision separation, contrast)
 * before use; three light-mode hues sit under 3:1 against the light surface, so
 * every chart carries a legend and the numbers are also available as a table in
 * the generated report.
 *
 * The dark palette is a *selected* set of steps for the dark surface, not the
 * light one brightened — an automatic flip puts the yellow and the orange at the
 * same apparent lightness and they stop being distinguishable.
 */

interface ChartPalette {
  /** Background the chart is drawn on, used for the gap between stacked fills. */
  page: string;
  panel: string;
  grid: string;
  axis: string;
  ink: string;
  series: readonly string[];
  /** For a state (outage), never for another series. */
  muted: string;
}

const LIGHT: ChartPalette = {
  page: '#F8F9FA',
  panel: '#FFFFFF',
  grid: '#e2e5e9',
  axis: '#6C757D',
  ink: '#212529',
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'],
  muted: '#adb5bd',
};

const DARK: ChartPalette = {
  page: '#121212',
  panel: '#1E1E1E',
  grid: '#343a40',
  axis: '#9aa0a6',
  ink: '#E0E0E0',
  series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'],
  muted: '#6c757d',
};

function useChartTheme(): ChartPalette {
  const { theme } = useTheme();
  return theme === 'dark' ? DARK : LIGHT;
}

const axisProps = (palette: ChartPalette) => ({
  stroke: palette.axis,
  tick: { fill: palette.axis, fontSize: 11 },
  tickLine: { stroke: palette.grid },
  axisLine: { stroke: palette.grid },
});

const tooltipStyle = (palette: ChartPalette) => ({
  contentStyle: {
    background: palette.panel,
    border: `1px solid ${palette.grid}`,
    borderRadius: 8,
    fontSize: 12,
    color: palette.ink,
  },
  labelStyle: { color: palette.ink, fontWeight: 600 },
});

const legendStyle = (palette: ChartPalette) => ({
  wrapperStyle: { fontSize: 12, color: palette.ink },
});

/**
 * Recharts types a tooltip value as `ValueType | undefined`, which is honest —
 * a formatter really can be handed a missing point. Coercing at the boundary
 * once keeps every call site from having to.
 */
const asNumber = (value: unknown): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
};

const formatBer = (value: unknown): string => {
  const numeric = asNumber(value);
  return numeric >= 1e-3 ? numeric.toFixed(4) : numeric.toExponential(1);
};

// ---------------------------------------------------------------- waterfall

export const WaterfallChart: React.FC<{
  data: { snrDb: number; measured: number; theory: number }[];
  height?: number;
}> = ({ data, height = 300 }) => {
  const palette = useChartTheme();
  const floor = Math.max(
    1e-7,
    Math.min(...data.map((point) => Math.min(point.measured, point.theory))) / 2,
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="snrDb"
          type="number"
          domain={['dataMin', 'dataMax']}
          {...axisProps(palette)}
          label={{ value: 'SNR (dB)', position: 'insideBottom', offset: -16, fill: palette.axis, fontSize: 12 }}
        />
        <YAxis
          scale="log"
          domain={[floor, 1]}
          {...axisProps(palette)}
          tickFormatter={(value: number) => value.toExponential(0)}
          label={{ value: 'Bit error rate', angle: -90, position: 'insideLeft', fill: palette.axis, fontSize: 12 }}
        />
        <Tooltip {...tooltipStyle(palette)} formatter={(value: unknown) => formatBer(value)} />
        <Legend verticalAlign="top" height={28} {...legendStyle(palette)} />
        <Line
          type="monotone"
          dataKey="measured"
          name="Measured (counted bit errors)"
          stroke={palette.series[0]}
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: palette.series[0] }}
          activeDot={{ r: 6 }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="theory"
          name="Closed-form AWGN"
          stroke={palette.series[1]}
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

// ------------------------------------------------------------ element sweep

export const ElementSweepChart: React.FC<{
  data: { elements: number; aligned: number; random: number; direct: number }[];
  height?: number;
}> = ({ data, height = 300 }) => {
  const palette = useChartTheme();
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="elements"
          scale="log"
          type="number"
          domain={['dataMin', 'dataMax']}
          ticks={[1, 2, 4, 8, 16, 32, 64, 128, 256]}
          {...axisProps(palette)}
          label={{ value: 'Reflecting elements N (log)', position: 'insideBottom', offset: -16, fill: palette.axis, fontSize: 12 }}
        />
        <YAxis
          {...axisProps(palette)}
          tickFormatter={(value: number) => value.toFixed(0)}
          label={{ value: 'SNR (dB)', angle: -90, position: 'insideLeft', fill: palette.axis, fontSize: 12 }}
        />
        <Tooltip {...tooltipStyle(palette)} formatter={(value: unknown) => `${asNumber(value).toFixed(1)} dB`} />
        <Legend verticalAlign="top" height={28} {...legendStyle(palette)} />
        <Line
          type="monotone"
          dataKey="aligned"
          name="With the surface, phases aligned"
          stroke={palette.series[0]}
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: palette.series[0] }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="random"
          name="With the surface, phases random"
          stroke={palette.series[1]}
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: palette.series[1] }}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="direct"
          name="Without the surface"
          stroke={palette.series[2]}
          strokeWidth={2}
          strokeDasharray="6 4"
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

// ------------------------------------------------------------- convergence

export const ConvergenceChart: React.FC<{ results: OptimizerResult[]; height?: number }> = ({
  results,
  height = 320,
}) => {
  const palette = useChartTheme();

  // Recharts wants one row per x value with a column per series. The traces
  // have different lengths and different x values, so they are merged onto the
  // union of evaluation counts and carried forward — a search's best-so-far is
  // by definition unchanged between the points it reported.
  const merged = React.useMemo(() => {
    const evaluations = new Set<number>();
    for (const result of results) for (const point of result.trace) evaluations.add(point.evaluation);
    const sorted = [...evaluations].sort((a, b) => a - b);

    return sorted.map((evaluation) => {
      const row: Record<string, number> = { evaluation };
      for (const result of results) {
        const applicable = result.trace.filter((point) => point.evaluation <= evaluation);
        const latest = applicable[applicable.length - 1];
        if (latest) row[result.id] = latest.snrDb;
      }
      return row;
    });
  }, [results]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={merged} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="evaluation"
          type="number"
          domain={[1, 'dataMax']}
          scale="log"
          {...axisProps(palette)}
          label={{ value: 'Channel evaluations spent (log)', position: 'insideBottom', offset: -16, fill: palette.axis, fontSize: 12 }}
        />
        <YAxis
          {...axisProps(palette)}
          tickFormatter={(value: number) => value.toFixed(0)}
          label={{ value: 'Best SNR so far (dB)', angle: -90, position: 'insideLeft', fill: palette.axis, fontSize: 12 }}
        />
        <Tooltip {...tooltipStyle(palette)} formatter={(value: unknown) => `${asNumber(value).toFixed(2)} dB`} />
        <Legend verticalAlign="top" height={28} {...legendStyle(palette)} />
        {results.map((result, index) => (
          <Line
            key={result.id}
            type="stepAfter"
            dataKey={result.id}
            name={result.label}
            stroke={palette.series[index % palette.series.length]}
            strokeWidth={2}
            strokeDasharray={result.id === 'closed-form' ? '6 4' : undefined}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};

// ---------------------------------------------------- architecture sweep

export const ArchitectureSweepChart: React.FC<{ data: SweepPoint[]; height?: number }> = ({
  data,
  height = 320,
}) => {
  const palette = useChartTheme();
  const series = [
    { key: 'cnn', label: 'CNN DeepJSCC' },
    { key: 'transformer', label: 'Transformer DeepJSCC' },
    { key: 'mlp', label: 'Dense autoencoder' },
    { key: 'classical', label: 'Classical DCT + coding' },
  ] as const;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="snrDb"
          type="number"
          domain={['dataMin', 'dataMax']}
          {...axisProps(palette)}
          label={{ value: 'Channel SNR (dB)', position: 'insideBottom', offset: -16, fill: palette.axis, fontSize: 12 }}
        />
        <YAxis
          {...axisProps(palette)}
          tickFormatter={(value: number) => value.toFixed(0)}
          label={{ value: 'Reconstruction PSNR (dB)', angle: -90, position: 'insideLeft', fill: palette.axis, fontSize: 12 }}
        />
        <Tooltip {...tooltipStyle(palette)} formatter={(value: unknown) => `${asNumber(value).toFixed(1)} dB`} />
        <Legend verticalAlign="top" height={28} {...legendStyle(palette)} />
        {series.map((entry, index) => (
          <Line
            key={entry.key}
            type="monotone"
            dataKey={entry.key}
            name={entry.label}
            stroke={palette.series[index]}
            strokeWidth={2}
            strokeDasharray={entry.key === 'classical' ? '6 4' : undefined}
            dot={{ r: 3, strokeWidth: 0, fill: palette.series[index] }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};

// ------------------------------------------------------------ constellation

export const ConstellationChart: React.FC<{
  symbols: { x: number; y: number }[];
  ideal: { x: number; y: number }[];
  height?: number;
}> = ({ symbols, ideal, height = 300 }) => {
  const palette = useChartTheme();
  const extent = React.useMemo(() => {
    const values = symbols.flatMap((point) => [Math.abs(point.x), Math.abs(point.y)]);
    return Math.max(1.6, ...values.map((v) => Math.min(v, 4)));
  }, [symbols]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" />
        <XAxis
          type="number"
          dataKey="x"
          domain={[-extent, extent]}
          {...axisProps(palette)}
          tickFormatter={(value: number) => value.toFixed(1)}
          label={{ value: 'In-phase', position: 'insideBottom', offset: -16, fill: palette.axis, fontSize: 12 }}
        />
        <YAxis
          type="number"
          dataKey="y"
          domain={[-extent, extent]}
          {...axisProps(palette)}
          tickFormatter={(value: number) => value.toFixed(1)}
          label={{ value: 'Quadrature', angle: -90, position: 'insideLeft', fill: palette.axis, fontSize: 12 }}
        />
        <ZAxis range={[26, 26]} />
        <Tooltip {...tooltipStyle(palette)} formatter={(value: unknown) => asNumber(value).toFixed(3)} />
        <Legend verticalAlign="top" height={28} {...legendStyle(palette)} />
        <Scatter
          name="Received, equalised"
          data={symbols}
          fill={palette.series[0]}
          fillOpacity={0.55}
          isAnimationActive={false}
        />
        <Scatter
          name="Ideal constellation"
          data={ideal}
          fill={palette.series[1]}
          shape="cross"
          isAnimationActive={false}
        />
      </ScatterChart>
    </ResponsiveContainer>
  );
};

// ------------------------------------------------------------------ latency

export const LatencyChart: React.FC<{ latency: LatencyBudget; height?: number }> = ({
  latency,
  height = 150,
}) => {
  const palette = useChartTheme();
  const data = [
    {
      name: 'One-way budget',
      Alignment: Number(latency.alignmentMs.toFixed(4)),
      'Time on air': Number((Number.isFinite(latency.transmissionMs) ? latency.transmissionMs : 0).toFixed(4)),
      Processing: Number(latency.processingMs.toFixed(4)),
      Retransmission: Number(latency.retransmissionMs.toFixed(4)),
      Propagation: Number(latency.propagationMs.toFixed(5)),
    },
  ];
  const segments = ['Alignment', 'Time on air', 'Processing', 'Retransmission', 'Propagation'] as const;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          {...axisProps(palette)}
          tickFormatter={(value: number) => `${value.toFixed(2)} ms`}
        />
        <YAxis type="category" dataKey="name" hide />
        <Tooltip {...tooltipStyle(palette)} formatter={(value: unknown) => `${asNumber(value).toFixed(3)} ms`} />
        <Legend verticalAlign="bottom" height={28} {...legendStyle(palette)} />
        {segments.map((segment, index) => (
          <Bar
            key={segment}
            dataKey={segment}
            stackId="latency"
            fill={palette.series[index % palette.series.length]}
            // A 2px gap between stacked segments keeps adjacent fills from
            // reading as one block when two of them are similar in size.
            stroke={palette.page}
            strokeWidth={2}
            radius={index === segments.length - 1 ? [0, 4, 4, 0] : undefined}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};

// --------------------------------------------------------------- user rates

export const UserRateChart: React.FC<{ users: UserResult[]; height?: number }> = ({
  users,
  height = 280,
}) => {
  const palette = useChartTheme();
  const data = users.map((user) => ({
    name: `U${user.index}`,
    distance: user.distanceM,
    rate: Number((user.goodputBps / 1e6).toFixed(2)),
    snr: user.snrDb,
    outage: user.modulation === null,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="name"
          {...axisProps(palette)}
          label={{ value: 'User (nearest first)', position: 'insideBottom', offset: -16, fill: palette.axis, fontSize: 12 }}
        />
        <YAxis
          {...axisProps(palette)}
          label={{ value: 'Goodput (Mbit/s)', angle: -90, position: 'insideLeft', fill: palette.axis, fontSize: 12 }}
        />
        <Tooltip
          {...tooltipStyle(palette)}
          formatter={(value: unknown, name: unknown) =>
            name === 'rate' ? `${asNumber(value).toFixed(2)} Mbit/s` : String(value)
          }
          labelFormatter={(label: unknown, payload?: readonly { payload?: unknown }[]) => {
            const row = payload?.[0]?.payload as { distance: number; snr: number } | undefined;
            return row ? `${String(label)} — ${row.distance} m, ${row.snr} dB` : String(label);
          }}
        />
        <Bar dataKey="rate" name="Goodput" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {data.map((row) => (
            // Outage is a state, not a series, so it takes the muted step
            // rather than another categorical hue — and the tooltip names it.
            <Cell key={row.name} fill={row.outage ? palette.muted : palette.series[0]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

// ----------------------------------------------------------- model cards

/**
 * A model card's measured performance: reconstruction quality against SNR, one
 * line per bandwidth ratio.
 *
 * Four lines on one chart is the limit before identity becomes hard to hold, so
 * the rates are the series and the architecture is chosen outside the chart —
 * the alternative, twelve lines for three architectures at four rates, is the
 * spaghetti this rule exists to prevent.
 */
export const RateCurveChart: React.FC<{
  points: { snrDb: number; channelUses: number; psnrDb: number }[];
  height?: number;
}> = ({ points, height = 300 }) => {
  const palette = useChartTheme();

  const rates = React.useMemo(
    () => [...new Set(points.map((point) => point.channelUses))].sort((a, b) => b - a),
    [points],
  );

  const data = React.useMemo(() => {
    const bySnr = new Map<number, Record<string, number>>();
    for (const point of points) {
      const row = bySnr.get(point.snrDb) ?? { snrDb: point.snrDb };
      row[`uses${point.channelUses}`] = point.psnrDb;
      bySnr.set(point.snrDb, row);
    }
    return [...bySnr.values()].sort((a, b) => (a.snrDb ?? 0) - (b.snrDb ?? 0));
  }, [points]);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 28, left: 8 }}>
        <CartesianGrid stroke={palette.grid} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="snrDb"
          type="number"
          domain={['dataMin', 'dataMax']}
          {...axisProps(palette)}
          label={{ value: 'Channel SNR (dB)', position: 'insideBottom', offset: -16, fill: palette.axis, fontSize: 12 }}
        />
        <YAxis
          {...axisProps(palette)}
          tickFormatter={(value: number) => value.toFixed(0)}
          label={{ value: 'PSNR on held-out scenes (dB)', angle: -90, position: 'insideLeft', fill: palette.axis, fontSize: 12 }}
        />
        <Tooltip {...tooltipStyle(palette)} formatter={(value: unknown) => `${asNumber(value).toFixed(2)} dB`} />
        <Legend verticalAlign="top" height={28} {...legendStyle(palette)} />
        {rates.map((rate, index) => (
          <Line
            key={rate}
            type="monotone"
            dataKey={`uses${rate}`}
            name={`${rate} channel uses (ρ = ${(rate / 256).toFixed(4)})`}
            stroke={palette.series[index % palette.series.length]}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: palette.series[index % palette.series.length] }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};
