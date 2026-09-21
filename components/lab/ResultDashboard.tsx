import React, { Suspense, lazy } from 'react';
import Card from '../ui/Card';
import { MetricTile, SceneImage, SectionHeading, SimulationBadge } from './Primitives';
import type { ExperimentResult } from '../../lib/experiment';
import { formatLatency, formatRate } from '../../lib/performance';
import { architectureById } from '../../lib/nn/jscc';
import { optimizerById } from '../../lib/optimizers';
import { SCENE_LABELS } from '../../lib/sources';

/**
 * The visualisation dashboard (spec §6, §10.7).
 *
 * Charts live behind `React.lazy` because recharts is the largest dependency in
 * the app and drags a state library along with it. A learner reading the
 * Knowledge Bank should not download it; one who has just run an experiment
 * pays for it once.
 */
const WaterfallChart = lazy(() =>
  import('./Charts').then((m) => ({ default: m.WaterfallChart })),
);
const ElementSweepChart = lazy(() =>
  import('./Charts').then((m) => ({ default: m.ElementSweepChart })),
);
const ConvergenceChart = lazy(() =>
  import('./Charts').then((m) => ({ default: m.ConvergenceChart })),
);
const ArchitectureSweepChart = lazy(() =>
  import('./Charts').then((m) => ({ default: m.ArchitectureSweepChart })),
);
const ConstellationChart = lazy(() =>
  import('./Charts').then((m) => ({ default: m.ConstellationChart })),
);
const LatencyChart = lazy(() => import('./Charts').then((m) => ({ default: m.LatencyChart })));
const UserRateChart = lazy(() => import('./Charts').then((m) => ({ default: m.UserRateChart })));

/**
 * Contains a failed chart to the chart.
 *
 * The chart chunk is loaded dynamically, so a stale `index.html` after a deploy
 * — or simply a dropped connection — rejects the import. Without a boundary
 * here that rejection propagates to the application-level one and replaces the
 * entire results page, including the measured numbers, with a reload prompt.
 * The numbers are the point; losing them because a picture of them would not
 * load is the wrong trade.
 */
class ChartBoundary extends React.Component<
  { height: number; children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error) {
    console.error('[ai-6g] chart failed to render:', error);
  }

  override render() {
    if (this.state.failed) {
      return (
        <div
          style={{ height: this.props.height }}
          className="flex items-center justify-center rounded-md border border-dashed border-gray-300 p-4 text-center text-sm text-secondary dark:border-gray-600 dark:text-gray-400"
        >
          This chart could not be drawn. The figures it plots are in the tables and tiles above,
          and reloading the page usually fixes it.
        </div>
      );
    }
    return this.props.children;
  }
}

const ChartFrame: React.FC<{ height?: number; children: React.ReactNode }> = ({
  height = 300,
  children,
}) => (
  <ChartBoundary height={height}>
    <Suspense
      fallback={
        <div
          style={{ height }}
          className="flex items-center justify-center rounded-md bg-background-light text-sm text-secondary dark:bg-background-dark dark:text-gray-400"
        >
          Loading chart…
        </div>
      }
    >
      {children}
    </Suspense>
  </ChartBoundary>
);

const berText = (value: number): string =>
  value < 1e-4 ? value.toExponential(2) : `${(value * 100).toFixed(2)}%`;

const GRADE_TONE = {
  excellent: 'good',
  good: 'good',
  marginal: 'warn',
  outage: 'bad',
} as const;

export const ResultDashboard: React.FC<{ result: ExperimentResult }> = ({ result }) => {
  const { link, measured, throughput, latency, energy, quality } = result;
  const berRatio = measured.theoreticalBer > 0 ? measured.ber / measured.theoreticalBer : 0;

  return (
    <div className="space-y-8">
      <section>
        <SectionHeading
          title="Communication metrics"
          description="Throughput, latency, energy efficiency, bit error rate and signal quality, for the route the receiver was actually served on."
          action={<SimulationBadge />}
        />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-5">
          <MetricTile
            label="Operating SNR"
            value={`${link.servingSnrDb.toFixed(1)} dB`}
            hint={
              link.surfaceGainDb === null
                ? 'direct path, no surface deployed'
                : link.surfaceGainDb >= 1
                  ? `the surface contributes ${link.surfaceGainDb.toFixed(1)} dB of this`
                  : 'the surface contributes under 1 dB'
            }
            tone={GRADE_TONE[quality.grade]}
            source="|h_eff|²·P/N₀"
          />
          <MetricTile
            label="Throughput"
            value={formatRate(throughput.goodputBps)}
            hint={
              throughput.modulation
                ? `${throughput.modulation.name}, after ${(measured.bler * 100).toFixed(1)}% block errors`
                : 'link in outage'
            }
            tone={throughput.outage ? 'bad' : 'neutral'}
            source={`Shannon bound ${formatRate(throughput.capacityBps)}`}
          />
          <MetricTile
            label="Latency"
            value={formatLatency(latency.totalMs)}
            hint={`${latency.expectedTransmissions.toFixed(2)} transmissions per packet`}
            tone={latency.totalMs > 10 ? 'warn' : 'neutral'}
            source="alignment + air + processing + HARQ"
          />
          <MetricTile
            label="Bit error rate"
            value={berText(measured.ber)}
            hint={`counted over ${measured.bitsSent.toLocaleString()} bits`}
            tone={measured.ber > 1e-2 ? 'bad' : measured.ber > 1e-3 ? 'warn' : 'good'}
            source={`closed form ${berText(measured.theoreticalBer)}${berRatio > 3 ? ` — measured is ${berRatio.toFixed(0)}× worse, which is fading` : ''}`}
          />
          <MetricTile
            label="Energy efficiency"
            value={`${energy.megabitsPerJoule.toFixed(1)} Mbit/J`}
            hint={`${energy.totalW.toFixed(2)} W total`}
            source={`surface ${energy.surfaceW.toFixed(2)} W, amplifier ${energy.transmitW.toFixed(2)} W`}
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <p className="text-sm font-semibold">Signal quality — {quality.grade}</p>
            <p className="mt-1 text-sm text-secondary dark:text-gray-400">{quality.note}</p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-secondary dark:text-gray-400">Error vector magnitude</dt>
                <dd className="font-mono font-semibold">
                  {quality.grade === 'outage' ? '—' : `${quality.evmPercent.toFixed(2)}%`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-secondary dark:text-gray-400">Block error rate</dt>
                <dd className="font-mono font-semibold">{(measured.bler * 100).toFixed(2)}%</dd>
              </div>
              <div>
                <dt className="text-xs text-secondary dark:text-gray-400">Without the surface</dt>
                <dd className="font-mono font-semibold">{link.directSnrDb.toFixed(1)} dB</dd>
              </div>
              <div>
                <dt className="text-xs text-secondary dark:text-gray-400">With the surface</dt>
                <dd className="font-mono font-semibold">
                  {link.irsSnrDb === null
                    ? 'not deployed'
                    : `${link.irsSnrDb.toFixed(1)} dB (+${(link.surfaceGainDb ?? 0).toFixed(1)})`}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
            <p className="mb-2 text-sm font-semibold">Latency budget</p>
            {Number.isFinite(latency.totalMs) ? (
              <ChartFrame height={150}>
                <LatencyChart latency={latency} />
              </ChartFrame>
            ) : (
              // With no sustainable modulation the time on air is infinite, so
              // there is no budget to break down. Drawing the other four
              // segments would show a small, tidy bar for a link that never
              // delivers the packet at all.
              <p className="py-6 text-sm text-secondary dark:text-gray-400">
                The link is in outage, so the packet never finishes transmitting and there is no
                latency budget to break down. Raise the SNR until a modulation is sustainable.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-1 text-lg font-semibold">Bit error rate against SNR</h3>
          <p className="mb-4 text-sm text-secondary dark:text-gray-400">
            The measured curve counts errors over generated noise; the dashed curve is the closed
            form for an AWGN channel. A gap between them is the cost of fading — the average SNR is
            the same, but the blocks that drew a deep fade dominate the error count.
          </p>
          <ChartFrame>
            <WaterfallChart data={result.waterfall} />
          </ChartFrame>
        </Card>

        <Card>
          <h3 className="mb-1 text-lg font-semibold">Received constellation</h3>
          {measured.modulation ? (
            <>
              <p className="mb-4 text-sm text-secondary dark:text-gray-400">
                {measured.modulation.name} symbols after equalisation, against the ideal points. The
                spread of the cloud is the error vector magnitude — {quality.evmPercent.toFixed(1)}%
                here.
              </p>
              <ChartFrame>
                <ConstellationChart
                  symbols={measured.symbols}
                  ideal={measured.modulation.points.map((point) => ({ x: point.re, y: point.im }))}
                />
              </ChartFrame>
            </>
          ) : (
            // No modulation was selected, so the symbols in `measured` came
            // from the fallback the simulator used to produce *a* measurement.
            // Plotting them under a caption that says there is nothing to plot
            // is worse than plotting nothing.
            <p className="py-10 text-sm text-secondary dark:text-gray-400">
              The link is in outage. No modulation in the table clears its threshold at{' '}
              {link.servingSnrDb.toFixed(1)} dB, so there is no constellation to show — the bit
              error rate above was measured with BPSK purely so the failure has a number attached to
              it.
            </p>
          )}
        </Card>
      </section>

      {result.config.irs.enabled && (
        <Card>
          <h3 className="mb-1 text-lg font-semibold">Element scaling</h3>
          <p className="mb-4 text-sm text-secondary dark:text-gray-400">
            Each line is the SNR of the whole combined channel, so the two surface curves start
            level with the direct path and lift off it once the cascade becomes the larger term.
            Past that point, aligned phases add in amplitude and power grows as N² — 6 dB per
            doubling — while random phases add incoherently and grow as N, 3 dB per doubling. The
            distance between the two is what choosing the phases is worth.
          </p>
          <ChartFrame height={320}>
            <ElementSweepChart data={result.elementSweep} />
          </ChartFrame>
        </Card>
      )}

      {result.optimisers && (
        <Card>
          <SectionHeading
            title="Optimiser comparison"
            description="Every method searched the same surface with the same evaluation budget and the same starting seed. The trace is best-so-far, which is what a controller would keep."
          />
          <ChartFrame height={340}>
            <ConvergenceChart results={result.optimisers} />
          </ChartFrame>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Final SNR and evaluations spent per optimiser</caption>
              <thead>
                <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                  <th className="py-2 pr-4 font-semibold">Method</th>
                  <th className="py-2 pr-4 font-semibold">Final SNR</th>
                  <th className="py-2 pr-4 font-semibold">Gap to optimum</th>
                  <th className="py-2 pr-4 font-semibold">Evaluations</th>
                  <th className="py-2 font-semibold">Needs</th>
                </tr>
              </thead>
              <tbody>
                {result.optimisers.map((entry) => {
                  const optimum = result.optimisers!.find((o) => o.id === 'closed-form');
                  return (
                    <tr key={entry.id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 pr-4 font-semibold">{entry.label}</td>
                      <td className="py-2 pr-4 font-mono">{entry.bestSnrDb.toFixed(2)} dB</td>
                      <td className="py-2 pr-4 font-mono">
                        {optimum ? `${(optimum.bestSnrDb - entry.bestSnrDb).toFixed(2)} dB` : '—'}
                      </td>
                      <td className="py-2 pr-4 font-mono">{entry.evaluations.toLocaleString()}</td>
                      <td className="py-2 text-xs text-secondary dark:text-gray-400">
                        {optimizerById(entry.id).requires}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {result.semantic && (
        <Card>
          <SectionHeading
            title="Semantic transmission"
            description={`Both systems received ${result.semantic.budget.channelUses} complex channel uses over the same channel. Neither reconstruction was described in advance — both were produced and then measured against the original.`}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile
              label={`${architectureById(result.semantic.config.architecture).label} PSNR`}
              value={`${result.semantic.aggregate.neuralPsnrDb.toFixed(1)} dB`}
              hint={`SSIM ${result.semantic.aggregate.neuralSsim.toFixed(3)}`}
              tone="good"
            />
            <MetricTile
              label="Classical PSNR"
              value={`${result.semantic.aggregate.classicalPsnrDb.toFixed(1)} dB`}
              hint={`SSIM ${result.semantic.aggregate.classicalSsim.toFixed(3)}`}
              tone={
                result.semantic.aggregate.classicalPsnrDb <
                result.semantic.aggregate.neuralPsnrDb
                  ? 'warn'
                  : 'good'
              }
            />
            <MetricTile
              label="Task-weighted score"
              value={`${result.semantic.aggregate.neuralSemanticDb.toFixed(1)} dB`}
              hint={`classical ${result.semantic.aggregate.classicalSemanticDb.toFixed(1)} dB · importance ${result.semantic.config.importance.toFixed(2)}`}
            />
            <MetricTile
              label="Classical blocks lost"
              value={`${(result.semantic.aggregate.classicalLossRate * 100).toFixed(0)}%`}
              hint="the decoder recovered nothing at all"
              tone={result.semantic.aggregate.classicalLossRate > 0 ? 'bad' : 'good'}
            />
          </div>

          <div className="mt-6 space-y-4">
            {result.semantic.samples.map((sample, index) => (
              <div
                key={index}
                className="grid grid-cols-3 items-start gap-4 rounded-lg border border-gray-200 p-4 dark:border-gray-700 sm:grid-cols-[1fr_1fr_1fr_1.4fr]"
              >
                <figure>
                  <SceneImage pixels={sample.original} label="Original scene" />
                  <figcaption className="mt-1 text-center text-xs font-semibold">
                    Sent — {SCENE_LABELS[sample.descriptor.sceneClass]}
                  </figcaption>
                </figure>
                <figure>
                  <SceneImage pixels={sample.neural} label="Neural reconstruction" />
                  <figcaption className="mt-1 text-center text-xs">
                    DeepJSCC
                    <span className="block font-mono text-[11px] text-secondary dark:text-gray-400">
                      {sample.neuralPsnrDb.toFixed(1)} dB
                    </span>
                  </figcaption>
                </figure>
                <figure>
                  <SceneImage pixels={sample.classical} label="Classical reconstruction" />
                  <figcaption className="mt-1 text-center text-xs">
                    Classical
                    <span className="block font-mono text-[11px] text-secondary dark:text-gray-400">
                      {sample.classicalLost ? 'block lost' : `${sample.classicalPsnrDb.toFixed(1)} dB`}
                    </span>
                  </figcaption>
                </figure>
                <p className="col-span-3 text-xs text-secondary dark:text-gray-400 sm:col-span-1">
                  {sample.classicalLost
                    ? 'The classical decoder ran out of correction capability, so the receiver has nothing and falls back to flat grey. The neural path has no equivalent failure — it degrades instead.'
                    : `Both systems delivered something. Structural similarity: ${sample.neuralSsim.toFixed(3)} neural against ${sample.classicalSsim.toFixed(3)} classical.`}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {result.architectureSweep && (
        <Card>
          <SectionHeading
            title="Architecture comparison across SNR"
            description="Three trained architectures and the classical baseline on identical scenes with identical noise seeds. The classical curve has a threshold; the neural curves do not."
          />
          <ChartFrame height={340}>
            <ArchitectureSweepChart data={result.architectureSweep} />
          </ChartFrame>
        </Card>
      )}

      {result.users && (
        <Card>
          <SectionHeading
            title="Multi-user allocation"
            description="Equal bandwidth shares do not produce equal rates, because SNR falls with distance. Sum rate and fairness disagree, and both are shown."
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricTile
              label="Sum goodput"
              value={formatRate(result.users.reduce((total, user) => total + user.goodputBps, 0))}
              hint={`${result.users.length} users`}
            />
            <MetricTile
              label="Jain fairness"
              value={(result.fairness ?? 0).toFixed(3)}
              hint={`1.0 is perfectly equal, ${(1 / result.users.length).toFixed(2)} is winner-take-all`}
              tone={(result.fairness ?? 0) < 0.7 ? 'warn' : 'good'}
            />
            <MetricTile
              label="Users in outage"
              value={String(result.users.filter((user) => user.modulation === null).length)}
              hint="no modulation in the table closes the link"
              tone={result.users.some((user) => user.modulation === null) ? 'bad' : 'good'}
            />
          </div>
          <div className="mt-6">
            <ChartFrame height={280}>
              <UserRateChart users={result.users} />
            </ChartFrame>
          </div>
        </Card>
      )}

      <Card className="border-l-4 border-amber-400">
        <h3 className="text-lg font-semibold">What this run does not model</h3>
        <ul className="mt-3 space-y-2 text-sm text-secondary dark:text-gray-400">
          {result.notes.map((note) => (
            <li key={note} className="flex gap-2">
              <span aria-hidden="true" className="text-amber-500">
                •
              </span>
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

export default ResultDashboard;
