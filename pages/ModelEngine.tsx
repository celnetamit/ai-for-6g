import React, { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import Card from '../components/ui/Card';
import {
  SectionHeading,
  SelectField,
  SimulationBadge,
  SliderField,
  SceneImage,
} from '../components/lab/Primitives';
import {
  type ModelCard,
  type ModelCardEvaluationPoint,
  loadModel,
  loadModelCards,
} from '../lib/models/loader';
import {
  type ArchitectureId,
  ARCHITECTURES,
  LATENT_DIM,
  applyChannel,
  architectureById,
  decode,
  encode,
} from '../lib/nn/jscc';
import { tensor } from '../lib/nn/autograd';
import { IMAGE_PIXELS, generateDataset, makeRng, psnr, ssim } from '../lib/sources';

const RateCurveChart = lazy(() =>
  import('../components/lab/Charts').then((m) => ({ default: m.RateCurveChart })),
);

/**
 * The AI model engine (spec §10.5).
 *
 * Two things live here: the model cards, and a place to run a model on one
 * scene and watch what the channel does to it. The cards are the important
 * half. Every number on them was produced by `scripts/train-models.ts` on a
 * held-out set, and `tests/models.test.ts` re-runs that evaluation against the
 * weights this page loads — so a card that disagrees with the model it
 * describes fails the build rather than misleading a reader.
 */

interface CardPointWithRate extends ModelCardEvaluationPoint {
  channelUses: number;
}

const LiveDemo: React.FC<{ architecture: ArchitectureId }> = ({ architecture }) => {
  const [snrDb, setSnrDb] = React.useState(10);
  const [channelUses, setChannelUses] = React.useState(32);
  const [sceneIndex, setSceneIndex] = React.useState(0);
  const [state, setState] = React.useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | {
        status: 'ready';
        original: Float64Array;
        reconstruction: Float64Array;
        psnrDb: number;
        ssim: number;
      }
    | { status: 'error'; message: string }
  >({ status: 'idle' });

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    void (async () => {
      try {
        const model = await loadModel(architecture);
        if (cancelled) return;

        // Scenes from a seed the models never trained on.
        const scenes = generateDataset(8, 777_001);
        const scene = scenes[sceneIndex % scenes.length]!;
        const x = tensor(1, IMAGE_PIXELS, scene.pixels);
        const activeDims = Math.min(LATENT_DIM, channelUses * 2);

        const latent = encode(model, x, 1, activeDims);
        const received = applyChannel(
          latent,
          snrDb,
          makeRng(sceneIndex * 131 + Math.round(snrDb * 10) + channelUses),
          undefined,
          activeDims,
        );
        const output = decode(model, received, 1);
        const reconstruction = Float64Array.from(output.data);

        if (cancelled) return;
        setState({
          status: 'ready',
          original: scene.pixels,
          reconstruction,
          psnrDb: psnr(scene.pixels, reconstruction),
          ssim: ssim(scene.pixels, reconstruction),
        });
      } catch (failure) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: failure instanceof Error ? failure.message : 'Could not load the model.',
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [architecture, channelUses, sceneIndex, snrDb]);

  return (
    <Card>
      <h3 className="text-lg font-bold">Run it on one scene</h3>
      <p className="mt-1 text-sm text-secondary dark:text-gray-400">
        A scene the model has never seen, encoded to channel symbols, pushed through additive noise
        at the SNR you choose, and decoded. The scores are measured against the original.
      </p>

      <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,260px)]">
        <div className="space-y-5">
          <SliderField
            id="demo-snr"
            label="Channel SNR"
            value={snrDb}
            min={-10}
            max={25}
            unit="dB"
            onChange={setSnrDb}
            hint="Below about 0 dB the noise is comparable to the signal. Watch how the reconstruction degrades rather than failing."
          />
          <SelectField
            id="demo-uses"
            label="Channel uses"
            value={channelUses}
            options={[
              { value: 32, label: '32 — full latent (ρ = 1/8)' },
              { value: 24, label: '24 — punctured to three quarters' },
              { value: 16, label: '16 — half (ρ = 1/16)' },
              { value: 8, label: '8 — a quarter (ρ = 1/32)' },
            ]}
            onChange={setChannelUses}
          />
          <SliderField
            id="demo-scene"
            label="Scene"
            value={sceneIndex}
            min={0}
            max={7}
            onChange={setSceneIndex}
            hint="Eight held-out scenes, drawn from a seed the training run never used."
          />
        </div>

        <div>
          {state.status === 'ready' ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <figure>
                  <SceneImage pixels={state.original} label="Original scene" />
                  <figcaption className="mt-1 text-center text-xs font-semibold">Sent</figcaption>
                </figure>
                <figure>
                  <SceneImage pixels={state.reconstruction} label="Reconstructed scene" />
                  <figcaption className="mt-1 text-center text-xs font-semibold">Received</figcaption>
                </figure>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-center text-sm">
                <div>
                  <dt className="text-xs text-secondary dark:text-gray-400">PSNR</dt>
                  <dd className="font-mono font-bold">
                    {Number.isFinite(state.psnrDb) ? `${state.psnrDb.toFixed(1)} dB` : '∞'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-secondary dark:text-gray-400">SSIM</dt>
                  <dd className="font-mono font-bold">{state.ssim.toFixed(3)}</dd>
                </div>
              </dl>
            </>
          ) : state.status === 'error' ? (
            <p className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
              {state.message}
            </p>
          ) : (
            <div className="flex h-40 items-center justify-center rounded-md bg-background-light text-sm text-secondary dark:bg-background-dark dark:text-gray-400">
              Loading the model…
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

const ModelEngine: React.FC = () => {
  const [cards, setCards] = React.useState<ModelCard[] | null>(null);
  const [generatedAt, setGeneratedAt] = React.useState<string>('');
  const [selected, setSelected] = React.useState<ArchitectureId>('cnn');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void loadModelCards()
      .then((file) => {
        if (cancelled) return;
        setCards(file.cards);
        setGeneratedAt(file.generatedAt);
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setError(failure instanceof Error ? failure.message : 'Could not load the model cards.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const card = cards?.find((entry) => entry.id === selected);

  return (
    <div className="space-y-6">
      <SectionHeading
        as="h1"
        title="AI model engine"
        description="Three DeepJSCC architectures, trained offline on the same data with the same schedule, shipped with the measurements that justify them. The browser only runs inference."
        action={<SimulationBadge />}
      />

      {error && (
        <Card className="border-l-4 border-rose-500">
          <p className="text-sm">{error}</p>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {ARCHITECTURES.map((architecture) => {
          const entry = cards?.find((c) => c.id === architecture.id);
          return (
            <button
              key={architecture.id}
              type="button"
              aria-pressed={selected === architecture.id}
              onClick={() => setSelected(architecture.id)}
              className={`rounded-lg border-2 p-4 text-left transition-colors ${
                selected === architecture.id
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 hover:border-primary/50 dark:border-gray-700'
              }`}
            >
              <p className="font-semibold">{architecture.label}</p>
              <p className="text-xs text-secondary dark:text-gray-400">{architecture.family}</p>
              <p className="mt-2 text-sm text-secondary dark:text-gray-400">
                {architecture.summary}
              </p>
              {entry && (
                <p className="mt-3 font-mono text-xs">
                  {entry.parameters.toLocaleString()} parameters ·{' '}
                  {entry.evaluation.int8
                    .filter((p) => p.snrDb === 10 && (p as CardPointWithRate).channelUses === 32)
                    .map((p) => `${p.psnrDb.toFixed(1)} dB @ 10 dB SNR`)
                    .join('')}
                </p>
              )}
            </button>
          );
        })}
      </div>

      {card && (
        <>
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{card.label} — model card</h2>
                <p className="text-xs text-secondary dark:text-gray-400">
                  Generated {new Date(generatedAt).toLocaleString()} by{' '}
                  <code className="font-mono">scripts/train-models.ts</code>
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm">{architectureById(card.id).hypothesis}</p>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-secondary dark:text-gray-400">
                  Architecture
                </h3>
                <dl className="mt-2 space-y-1.5 text-sm">
                  {[
                    ['Family', card.family],
                    ['Trainable parameters', card.parameters.toLocaleString()],
                    ['Latent dimensions', String(card.latentDim)],
                    ['Channel uses at full rate', String(card.channelUses)],
                    ['Bandwidth ratio', card.bandwidthRatio.toFixed(4)],
                    ['Rates served', (card as unknown as { rates?: number[] }).rates?.join(', ') ?? '—'],
                    ['Stored as', `${card.storedAs} (${card.evaluation.quantisationCostDb.toFixed(3)} dB cost, measured)`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 border-b border-gray-100 pb-1 dark:border-gray-800">
                      <dt className="text-secondary dark:text-gray-400">{label}</dt>
                      <dd className="text-right font-mono">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-secondary dark:text-gray-400">
                  Training
                </h3>
                <dl className="mt-2 space-y-1.5 text-sm">
                  {[
                    ['Training samples', card.trainedOn.trainSamples.toLocaleString()],
                    ['Held-out samples', card.trainedOn.valSamples.toLocaleString()],
                    ['Training seed', String(card.trainedOn.trainSeed)],
                    ['Validation seed', String(card.trainedOn.valSeed)],
                    ['Epochs', String(card.training.epochs)],
                    ['Batch size', String(card.training.batch)],
                    ['Wall clock', `${card.training.seconds} s`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 border-b border-gray-100 pb-1 dark:border-gray-800">
                      <dt className="text-secondary dark:text-gray-400">{label}</dt>
                      <dd className="text-right font-mono">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-secondary dark:text-gray-400">
                  <strong>Data:</strong> {card.trainedOn.generator}
                </p>
                <p className="mt-1 text-xs text-secondary dark:text-gray-400">
                  <strong>Optimiser:</strong> {card.training.optimiser}
                </p>
                <p className="mt-1 text-xs text-secondary dark:text-gray-400">
                  <strong>Channel:</strong> {card.training.channel}
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-bold">Measured performance</h3>
            <p className="mt-1 text-sm text-secondary dark:text-gray-400">
              {card.evaluation.note} These are the shipped int8 weights, not the float32 originals —
              what is plotted is what the browser runs.
            </p>
            <div className="mt-4">
              <Suspense
                fallback={
                  <div className="flex h-[300px] items-center justify-center text-sm text-secondary dark:text-gray-400">
                    Loading chart…
                  </div>
                }
              >
                <RateCurveChart points={card.evaluation.int8 as CardPointWithRate[]} />
              </Suspense>
            </div>
          </Card>

          <Card className="border-l-4 border-amber-400">
            <h3 className="text-lg font-bold">Limitations</h3>
            <ul className="mt-3 space-y-2 text-sm text-secondary dark:text-gray-400">
              {card.limitations.map((limitation) => (
                <li key={limitation} className="flex gap-2">
                  <span aria-hidden="true" className="text-amber-500">
                    •
                  </span>
                  <span>{limitation}</span>
                </li>
              ))}
            </ul>
          </Card>

          <LiveDemo architecture={selected} />

          <Card>
            <h3 className="text-lg font-bold">Compare them properly</h3>
            <p className="mt-1 text-sm text-secondary dark:text-gray-400">
              Reading three cards side by side tells you which scored highest. It does not tell you
              where the difference comes from, or whether it survives a worse channel. The
              architecture comparison experiment sweeps all three and the classical baseline across
              SNR on identical scenes with identical noise.
            </p>
            <Link
              to="/experiments/architecture-comparison"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Run the comparison
            </Link>
          </Card>
        </>
      )}

      {!cards && !error && (
        <Card>
          <p className="text-sm text-secondary dark:text-gray-400">Loading model cards…</p>
        </Card>
      )}
    </div>
  );
};

export default ModelEngine;
