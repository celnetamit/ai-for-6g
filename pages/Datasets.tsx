import React from 'react';
import Card from '../components/ui/Card';
import {
  SectionHeading,
  SelectField,
  SimulationBadge,
  SliderField,
  downloadText,
} from '../components/lab/Primitives';
import {
  type Dataset,
  type DatasetId,
  type DatasetOptions,
  DATASETS,
  DEFAULT_DATASET_OPTIONS,
  generateDatasetRows,
  toCsv,
  toJson,
} from '../lib/datasets';
import { BANDS, CHANNEL_CONDITIONS } from '../lib/experiment';
import { ARCHITECTURES } from '../lib/nn/jscc';

/**
 * Dataset manager (spec §9, §10.6).
 *
 * The three demo datasets are generated on demand rather than shipped as files.
 * That is the honest arrangement for synthetic data: the generator is in the
 * repository, the seed is in the export header, and regenerating with that seed
 * reproduces the file exactly. A checked-in CSV of plausible numbers with no
 * provenance is the thing this avoids.
 */

const PREVIEW_ROWS = 12;

const Datasets: React.FC = () => {
  const [selected, setSelected] = React.useState<DatasetId>('wireless-channel');
  const [options, setOptions] = React.useState<DatasetOptions>(DEFAULT_DATASET_OPTIONS);
  const [dataset, setDataset] = React.useState<Dataset | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const meta = DATASETS.find((entry) => entry.id === selected)!;

  const generate = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // Yield first so the button's disabled state paints before a synchronous
      // generator ties up the main thread.
      await new Promise((resolve) => setTimeout(resolve, 0));
      setDataset(await generateDatasetRows(selected, options));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Generation failed.');
    } finally {
      setBusy(false);
    }
  }, [options, selected]);

  React.useEffect(() => {
    setDataset(null);
  }, [selected]);

  return (
    <div className="space-y-6">
      <SectionHeading
        as="h1"
        title="Dataset manager"
        description="Three demo datasets, each produced by the same engine that runs the experiments. Generate one, look at it, and export it with its provenance attached."
        action={<SimulationBadge />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {DATASETS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            // Without this the only signal that a dataset is selected is a
            // border colour, which a screen reader does not convey at all.
            aria-pressed={selected === entry.id}
            onClick={() => setSelected(entry.id)}
            className={`rounded-lg border-2 p-4 text-left transition-colors ${
              selected === entry.id
                ? 'border-primary bg-primary/5'
                : 'border-gray-200 hover:border-primary/50 dark:border-gray-700'
            }`}
          >
            <p className="font-semibold">{entry.title}</p>
            <p className="mt-1 text-sm text-secondary dark:text-gray-400">{entry.description}</p>
            <p className="mt-2 text-xs text-secondary dark:text-gray-400">
              {entry.columns.length} columns
              {entry.requiresModel && ' · loads a trained model'}
            </p>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Card>
          <h3 className="mb-4 text-lg font-bold">Generation parameters</h3>
          <div className="space-y-5">
            <SliderField
              id="rows"
              label="Rows"
              value={options.rows}
              min={20}
              max={400}
              step={20}
              onChange={(rows) => setOptions((previous) => ({ ...previous, rows }))}
              hint={
                meta.requiresModel
                  ? 'Each row runs a scene through a trained model and the classical pipeline, so this one takes longer.'
                  : 'Each row is an independent channel draw.'
              }
            />
            <SliderField
              id="dataset-seed"
              label="Seed"
              value={options.seed}
              min={1}
              max={99999}
              format={(value) => String(value)}
              onChange={(seed) => setOptions((previous) => ({ ...previous, seed }))}
              hint="Written into the export header. The same seed regenerates the same file."
            />
            <SelectField
              id="dataset-band"
              label="Carrier frequency"
              value={options.frequencyHz}
              options={BANDS.map((band) => ({ value: band.hz, label: band.label }))}
              onChange={(frequencyHz) => setOptions((previous) => ({ ...previous, frequencyHz }))}
            />
            <SelectField
              id="dataset-condition"
              label="Channel condition"
              value={options.conditionId}
              options={CHANNEL_CONDITIONS.map((condition) => ({
                value: condition.id,
                label: condition.label,
              }))}
              onChange={(conditionId) => setOptions((previous) => ({ ...previous, conditionId }))}
            />
            <SliderField
              id="dataset-bandwidth"
              label="Bandwidth"
              value={options.bandwidthHz / 1e6}
              min={10}
              max={2000}
              step={10}
              unit="MHz"
              onChange={(value) =>
                setOptions((previous) => ({ ...previous, bandwidthHz: value * 1e6 }))
              }
            />
            <SliderField
              id="dataset-power"
              label="Transmit power"
              value={options.txPowerDbm}
              min={0}
              max={33}
              unit="dBm"
              onChange={(txPowerDbm) => setOptions((previous) => ({ ...previous, txPowerDbm }))}
            />
            {meta.requiresModel && (
              <SelectField
                id="dataset-architecture"
                label="Model used for the reconstructions"
                value={options.architecture}
                options={ARCHITECTURES.map((architecture) => ({
                  value: architecture.id,
                  label: architecture.label,
                }))}
                onChange={(architecture) =>
                  setOptions((previous) => ({ ...previous, architecture }))
                }
              />
            )}
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void generate()}
            className="mt-6 w-full rounded-md bg-primary px-4 py-2.5 font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
          >
            {busy ? 'Generating…' : 'Generate dataset'}
          </button>
          {error && (
            <p className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </p>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <h3 className="text-lg font-bold">{meta.title}</h3>
            <p className="mt-1 text-sm text-secondary dark:text-gray-400">{meta.description}</p>
            <p className="mt-3 rounded-md border border-amber-400/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              <strong>Provenance.</strong> {meta.provenance} Every export carries this statement in
              its header, so a row cannot be mistaken for a measurement once the file leaves this
              page.
            </p>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Column definitions ({meta.columns.length})
              </summary>
              <dl className="mt-3 space-y-2 text-sm">
                {meta.columns.map((column) => (
                  <div key={column.key} className="grid grid-cols-[minmax(0,160px)_1fr] gap-3">
                    <dt className="font-mono text-xs font-semibold">
                      {column.label}
                      {column.unit && (
                        <span className="text-secondary dark:text-gray-400"> ({column.unit})</span>
                      )}
                    </dt>
                    <dd className="text-xs text-secondary dark:text-gray-400">
                      {column.description}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </Card>

          {dataset && (
            <Card>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold">
                    {dataset.rows.length} rows generated
                  </h3>
                  <p className="text-xs text-secondary dark:text-gray-400">
                    seed {dataset.options.seed} · {new Date(dataset.generatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      downloadText(`ai-6g-${dataset.meta.id}-${dataset.options.seed}.csv`, toCsv(dataset), 'text/csv')
                    }
                    className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadText(
                        `ai-6g-${dataset.meta.id}-${dataset.options.seed}.json`,
                        toJson(dataset),
                        'application/json',
                      )
                    }
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-semibold transition-colors hover:border-primary hover:text-primary dark:border-gray-600"
                  >
                    Export JSON
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <caption className="sr-only">
                    First {PREVIEW_ROWS} rows of the generated dataset
                  </caption>
                  <thead>
                    <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                      {dataset.meta.columns.map((column) => (
                        <th key={column.key} className="whitespace-nowrap px-2 py-2 font-semibold">
                          {column.label}
                          {column.unit && (
                            <span className="block font-normal text-secondary dark:text-gray-400">
                              {column.unit}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dataset.rows.slice(0, PREVIEW_ROWS).map((row, index) => (
                      <tr
                        key={index}
                        className="border-b border-gray-100 font-mono dark:border-gray-800"
                      >
                        {dataset.meta.columns.map((column) => (
                          <td key={column.key} className="whitespace-nowrap px-2 py-1.5">
                            {String(row[column.key] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dataset.rows.length > PREVIEW_ROWS && (
                <p className="mt-3 text-xs text-secondary dark:text-gray-400">
                  Showing the first {PREVIEW_ROWS} of {dataset.rows.length} rows. The export
                  contains all of them.
                </p>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default Datasets;
