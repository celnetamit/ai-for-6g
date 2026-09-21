import React from 'react';
import { SelectField, SliderField, ToggleField } from './Primitives';
import {
  BANDS,
  CHANNEL_CONDITIONS,
  type ExperimentConfig,
  type ExperimentId,
} from '../../lib/experiment';
import { ARCHITECTURES } from '../../lib/nn/jscc';
import { OPTIMIZERS } from '../../lib/optimizers';
import { noisePowerDbm } from '../../lib/channel';

/**
 * Every input in spec §5, grouped as the spec groups them.
 *
 * Which groups are shown depends on the experiment — a link-budget run has no
 * use for the semantic controls — but nothing is hidden permanently: the
 * "everything else" disclosure opens the rest, because a learner who wants to
 * see what a surface does to a link with no surface in the experiment should be
 * able to.
 *
 * Every control states its unit, and several state the consequence of moving
 * them. A slider labelled only "noise level" is a slider whose effect cannot be
 * predicted, and predicting the effect before moving it is the entire exercise.
 */

interface Props {
  config: ExperimentConfig;
  experimentId: ExperimentId;
  onChange: (update: (previous: ExperimentConfig) => ExperimentConfig) => void;
  disabled?: boolean;
}

const GROUPS_BY_EXPERIMENT: Record<
  ExperimentId,
  { communication: boolean; irs: boolean; semantic: boolean; optimiser: boolean }
> = {
  'link-budget': { communication: true, irs: false, semantic: false, optimiser: false },
  'irs-coverage': { communication: true, irs: true, semantic: false, optimiser: false },
  'ai-phase-optimisation': { communication: true, irs: true, semantic: false, optimiser: true },
  'semantic-transmission': { communication: true, irs: true, semantic: true, optimiser: false },
  'architecture-comparison': { communication: true, irs: true, semantic: true, optimiser: false },
  'multi-user-network': { communication: true, irs: true, semantic: false, optimiser: false },
};

const Group: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({
  title,
  note,
  children,
}) => (
  <fieldset className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
    <legend className="px-2 text-sm font-bold">{title}</legend>
    {note && <p className="mb-4 text-xs text-secondary dark:text-gray-400">{note}</p>}
    <div className="space-y-5">{children}</div>
  </fieldset>
);

export const ParameterPanel: React.FC<Props> = ({ config, experimentId, onChange, disabled }) => {
  const [showAll, setShowAll] = React.useState(false);
  const relevant = GROUPS_BY_EXPERIMENT[experimentId];
  const show = (key: keyof typeof relevant) => showAll || relevant[key];

  const setCommunication = (update: Partial<ExperimentConfig['communication']>) =>
    onChange((previous) => ({
      ...previous,
      communication: { ...previous.communication, ...update },
    }));
  const setIrs = (update: Partial<ExperimentConfig['irs']>) =>
    onChange((previous) => ({ ...previous, irs: { ...previous.irs, ...update } }));
  const setSemantic = (update: Partial<ExperimentConfig['semantic']>) =>
    onChange((previous) => ({ ...previous, semantic: { ...previous.semantic, ...update } }));
  const setAi = (update: Partial<ExperimentConfig['ai']>) =>
    onChange((previous) => ({ ...previous, ai: { ...previous.ai, ...update } }));

  const perUserBandwidth =
    config.communication.bandwidthHz / Math.max(1, config.communication.users);
  const noiseFloor = noisePowerDbm(perUserBandwidth, config.communication.noiseFigureDb);

  return (
    <div className="space-y-5">
      {show('communication') && (
        <Group
          title="Communication"
          note="The link itself: what it transmits on, how far, and into what."
        >
          <SelectField
            id="band"
            label="Frequency band"
            value={config.communication.frequencyHz}
            disabled={disabled}
            options={BANDS.map((band) => ({ value: band.hz, label: band.label, hint: band.note }))}
            onChange={(frequencyHz) => setCommunication({ frequencyHz })}
          />

          <SliderField
            id="bandwidth"
            label="System bandwidth"
            value={config.communication.bandwidthHz / 1e6}
            min={10}
            max={2000}
            step={10}
            unit="MHz"
            disabled={disabled}
            hint={`Shared between the users below, so each gets ${(perUserBandwidth / 1e6).toFixed(1)} MHz. More bandwidth raises the rate and the noise floor together — the noise floor here is ${noiseFloor.toFixed(1)} dBm.`}
            onChange={(value) => setCommunication({ bandwidthHz: value * 1e6 })}
          />

          <SliderField
            id="users"
            label="Users sharing the band"
            value={config.communication.users}
            min={1}
            max={16}
            disabled={disabled}
            hint="Orthogonal sharing: each user gets an equal slice of the bandwidth and no interference from the others."
            onChange={(users) => setCommunication({ users })}
          />

          <SliderField
            id="distance"
            label="Transmitter to receiver"
            value={config.communication.distanceM}
            min={10}
            max={400}
            step={5}
            unit="m"
            disabled={disabled}
            hint="Free-space loss grows as the square of this, and faster with the environment's exponent."
            onChange={(distanceM) => setCommunication({ distanceM })}
          />

          <SliderField
            id="power"
            label="Transmit power"
            value={config.communication.txPowerDbm}
            min={0}
            max={33}
            unit="dBm"
            disabled={disabled}
            format={(value) => `${value} (${(10 ** (value / 10) / 1000).toFixed(2)} W)`}
            hint="Every 3 dB doubles the transmitted power — and the amplifier's consumption more than doubles."
            onChange={(txPowerDbm) => setCommunication({ txPowerDbm })}
          />

          <SliderField
            id="noise-figure"
            label="Receiver noise level"
            value={config.communication.noiseFigureDb}
            min={2}
            max={15}
            unit="dB NF"
            disabled={disabled}
            hint="The noise the receiver adds on top of thermal noise. Every dB here is a dB of SNR, directly."
            onChange={(noiseFigureDb) => setCommunication({ noiseFigureDb })}
          />

          <SelectField
            id="condition"
            label="Channel condition"
            value={config.communication.conditionId}
            disabled={disabled}
            options={CHANNEL_CONDITIONS.map((condition) => ({
              value: condition.id,
              label: condition.label,
              hint: condition.description,
            }))}
            onChange={(conditionId) => setCommunication({ conditionId })}
          />
        </Group>
      )}

      {show('irs') && (
        <Group
          title="Intelligent reflecting surface"
          note="Φ = diag(β e^{jθ₁} … β e^{jθ_N}). These four numbers are everything the surface controls."
        >
          <ToggleField
            id="irs-enabled"
            label="Deploy a reflecting surface"
            checked={config.irs.enabled}
            hint="With this off the receiver is served by the direct path alone, which is the baseline the surface has to beat."
            onChange={(enabled) => setIrs({ enabled })}
          />

          <SliderField
            id="elements"
            label="Reflecting elements (N)"
            value={config.irs.elementCount}
            min={4}
            max={256}
            step={4}
            disabled={disabled || !config.irs.enabled}
            hint="Aligned phases give an N² power gain — 6 dB per doubling. Random phases give only N."
            onChange={(elementCount) => setIrs({ elementCount })}
          />

          <SliderField
            id="reflection"
            label="Reflection coefficient β"
            value={config.irs.reflectionCoefficient}
            min={0.2}
            max={1}
            step={0.05}
            disabled={disabled || !config.irs.enabled}
            format={(value) => value.toFixed(2)}
            hint="Power scales as β², so β = 0.7 costs 3.1 dB before anything else happens."
            onChange={(reflectionCoefficient) => setIrs({ reflectionCoefficient })}
          />

          <SelectField
            id="phase-bits"
            label="Phase shift control"
            value={config.irs.phaseBits}
            disabled={disabled || !config.irs.enabled}
            options={[
              { value: 0, label: 'Continuous (idealised)', hint: 'No hardware does this; it is the upper bound.' },
              { value: 1, label: '1 bit — two states', hint: 'Cheapest hardware. Costs 3.9 dB of array gain.' },
              { value: 2, label: '2 bit — four states', hint: 'The common choice. Costs 0.9 dB.' },
              { value: 3, label: '3 bit — eight states', hint: 'Costs 0.2 dB; past here there is nothing left to recover.' },
            ]}
            onChange={(phaseBits) => setIrs({ phaseBits })}
          />

          <SliderField
            id="surface-offset"
            label="Surface offset from the direct line"
            value={config.irs.surfaceOffsetM}
            min={1}
            max={40}
            disabled={disabled || !config.irs.enabled}
            unit="m"
            hint="The cascaded path pays free-space loss on both hops, and those losses multiply. Moving the surface off the line lengthens both."
            onChange={(surfaceOffsetM) => setIrs({ surfaceOffsetM })}
          />

          <SliderField
            id="surface-height"
            label="Surface mounting height"
            value={config.irs.surfaceHeightM}
            min={2}
            max={30}
            disabled={disabled || !config.irs.enabled}
            unit="m"
            hint="Changes the angles of arrival and departure, and therefore the phase pattern the surface has to correct."
            onChange={(surfaceHeightM) => setIrs({ surfaceHeightM })}
          />
        </Group>
      )}

      {show('semantic') && (
        <Group
          title="Semantic transmission"
          note="What is being sent, how much bandwidth it gets, and which parts of it matter."
        >
          <SelectField
            id="data-type"
            label="Data type"
            value={config.semantic.dataType}
            disabled={disabled}
            options={[
              {
                value: 'scene' as const,
                label: '16×16 sensor scene',
                hint: 'Procedurally generated scenes with a known object mask — the source the models were trained on.',
              },
            ]}
            onChange={(dataType) => setSemantic({ dataType })}
          />

          <SelectField
            id="channel-uses"
            label="Compression level"
            value={config.semantic.channelUses}
            disabled={disabled}
            options={[
              { value: 32, label: 'Light — 32 channel uses (ρ = 1/8)', hint: 'The full latent. Best quality, most bandwidth.' },
              { value: 24, label: 'Moderate — 24 channel uses (ρ = 3/32)', hint: 'The latent is punctured to three quarters.' },
              { value: 16, label: 'Heavy — 16 channel uses (ρ = 1/16)', hint: 'Half the bandwidth. The models are trained for this rate.' },
              { value: 8, label: 'Extreme — 8 channel uses (ρ = 1/32)', hint: 'A quarter of the symbols. Both systems suffer; watch which suffers more.' },
            ]}
            onChange={(channelUses) => setSemantic({ channelUses })}
          />

          <SliderField
            id="importance"
            label="Semantic importance"
            value={config.semantic.importance}
            min={0}
            max={1}
            step={0.05}
            disabled={disabled}
            format={(value) => value.toFixed(2)}
            hint="At 0 the score is ordinary PSNR. At 1 the object is weighted ten times the background, and the classical path shifts bits onto the coefficients that carry structure."
            onChange={(importance) => setSemantic({ importance })}
          />

          <SliderField
            id="code-rate"
            label="Channel code rate (classical path)"
            value={config.semantic.codeRate}
            min={0.3}
            max={0.95}
            step={0.05}
            disabled={disabled}
            format={(value) => value.toFixed(2)}
            hint="Lower means more redundancy: fewer payload bits, but the decoder survives more errors before the cliff."
            onChange={(codeRate) => setSemantic({ codeRate })}
          />

          <SliderField
            id="sample-count"
            label="Scenes per run"
            value={config.semantic.sampleCount}
            min={4}
            max={64}
            step={4}
            disabled={disabled}
            hint="More scenes give a steadier average and a slower run."
            onChange={(sampleCount) => setSemantic({ sampleCount })}
          />

          <SelectField
            id="architecture"
            label="AI model"
            value={config.ai.architecture}
            disabled={disabled}
            options={ARCHITECTURES.map((architecture) => ({
              value: architecture.id,
              label: architecture.label,
              hint: architecture.summary,
            }))}
            onChange={(architecture) => setAi({ architecture })}
          />
        </Group>
      )}

      {show('optimiser') && (
        <Group
          title="AI optimisation"
          note="Every method is charged the same number of channel evaluations, so the comparison is of methods and not of budgets."
        >
          <SliderField
            id="budget"
            label="Evaluation budget per method"
            value={config.ai.budget}
            min={500}
            max={12000}
            step={500}
            disabled={disabled}
            format={(value) => value.toLocaleString()}
            hint="One evaluation is one measurement of the resulting SNR. A real controller pays for each in time on the air."
            onChange={(budget) => setAi({ budget })}
          />

          <SelectField
            id="optimizer"
            label="Highlighted method"
            value={config.ai.optimizer}
            disabled={disabled}
            options={OPTIMIZERS.map((optimizer) => ({
              value: optimizer.id,
              label: optimizer.label,
              hint: `${optimizer.summary} Requires: ${optimizer.requires}`,
            }))}
            onChange={(optimizer) => setAi({ optimizer })}
          />
        </Group>
      )}

      <Group title="Reproducibility">
        <SliderField
          id="seed"
          label="Random seed"
          value={config.seed}
          min={1}
          max={99999}
          disabled={disabled}
          format={(value) => String(value)}
          hint="Everything stochastic in a run derives from this. The same configuration and seed reproduce every number exactly."
          onChange={(seed) => onChange((previous) => ({ ...previous, seed }))}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange((previous) => ({
              ...previous,
              seed: 1 + Math.floor(Math.random() * 99999),
            }))
          }
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold transition-colors hover:border-primary hover:text-primary disabled:opacity-50 dark:border-gray-600"
        >
          Draw a new seed
        </button>
      </Group>

      <button
        type="button"
        onClick={() => setShowAll((previous) => !previous)}
        className="w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-xs font-semibold text-secondary transition-colors hover:border-primary hover:text-primary dark:border-gray-600 dark:text-gray-400"
      >
        {showAll ? 'Show only the controls this experiment uses' : 'Show every control, including the ones this experiment ignores'}
      </button>
    </div>
  );
};

export default ParameterPanel;
