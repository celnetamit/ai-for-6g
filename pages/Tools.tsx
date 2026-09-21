
import React from 'react';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import Card from '../components/ui/Card';
import LazyThreeScene from '../components/LazyThreeScene';
import SemanticCommunicationSimulator from '../components/SemanticCommunicationSimulator';
import AutoencoderVisualizer from '../components/AutoencoderVisualizer';
import JSCCSimulator from '../components/JSCCSimulator';
import {
  directLinkRxDbm,
  irsLinkRxDbm,
  shannonCapacityBps,
  snrDb,
  type LinkBudget,
} from '../lib/channel';

/** Carrier options spanning the bands 6G research actually targets. */
const BANDS = [
  { label: '3.5 GHz (sub-6)', hz: 3.5e9 },
  { label: '28 GHz (mmWave)', hz: 28e9 },
  { label: '140 GHz (sub-THz)', hz: 140e9 },
] as const;

/**
 * Link budget for a reconfigurable intelligent surface.
 *
 * The previous implementation was wrong in three ways at once, and displayed
 * "Calculated SNR: -92.91 dB" for a link that should be comfortably positive:
 *
 *   const baselineSNR = 10 * Math.log10(power / (distance * distance)) - 90;
 *   const gain        = 10 * Math.log10(i);
 *
 *   1. `power` comes from a slider labelled **dBm**. Taking its logarithm
 *      treats a decibel value as if it were linear milliwatts — a unit error
 *      that makes every number downstream meaningless.
 *   2. The `- 90` was a noise floor with no derivation. A noise floor follows
 *      from bandwidth and noise figure: -174 dBm/Hz + 10log10(B) + NF.
 *   3. The array gain used 10*log10(N). The defining result of the IRS
 *      literature is that received power scales as **N squared**, because the
 *      N reflected amplitudes add coherently, so the gain is 20*log10(N)
 *      (Wu & Zhang, IEEE TWC 2019). At 256 elements the old formula
 *      understated the surface by 24 dB — and that scaling law is the one
 *      thing this module exists to teach.
 *
 * There was also no frequency anywhere, in a lab about 6G, where the move to
 * mmWave and sub-THz is precisely what makes path loss the design constraint.
 */
const IrsSimulator: React.FC = () => {
  /*
   * Defaults chosen so the opening view shows the surface *winning*, and the
   * learner discovers the limits by moving sliders rather than by starting at
   * a link that does not close. At 128 elements, 30 m and 28 GHz the IRS path
   * reaches about +7 dB while a 45 dB-blocked direct path sits near -4 dB.
   * Drop to 16 elements, or stretch the distance, and the surface loses — which
   * is the genuinely surprising result and worth arriving at deliberately.
   */
  const [numElements, setNumElements] = React.useState(128);
  const [distance, setDistance] = React.useState(30);
  const [txPowerDbm, setTxPowerDbm] = React.useState(20);
  const [bandIndex, setBandIndex] = React.useState(1);
  const [blockageDb, setBlockageDb] = React.useState(45);

  const link: LinkBudget = React.useMemo(
    () => ({
      txPowerDbm,
      frequencyHz: BANDS[bandIndex]!.hz,
      bandwidthHz: 100e6,
      txGainDbi: 15,
      rxGainDbi: 10,
      noiseFigureDb: 7,
    }),
    [bandIndex, txPowerDbm],
  );

  // The surface sits midway between transmitter and receiver, so the signal
  // pays free-space loss over each half separately. Those losses multiply,
  // which is why a small surface cannot beat a clear direct path.
  const hop = distance / 2;

  const directSnr = React.useMemo(
    () => snrDb(directLinkRxDbm(link, distance, blockageDb), link),
    [blockageDb, distance, link],
  );

  const irsSnr = React.useMemo(
    () => snrDb(irsLinkRxDbm(link, hop, hop, numElements), link),
    [hop, link, numElements],
  );

  const data = React.useMemo(() => {
    const points: { elements: number; snr: number; baselineSnr: number }[] = [];
    for (let n = 1; n <= 256; n *= 2) {
      points.push({
        elements: n,
        // Numbers, not strings. `toFixed` returned strings, which Recharts then
        // had to coerce on every point.
        snr: Number(snrDb(irsLinkRxDbm(link, hop, hop, n), link).toFixed(2)),
        baselineSnr: Number(directSnr.toFixed(2)),
      });
    }
    return points;
  }, [directSnr, hop, link]);

  const capacityGbps = React.useMemo(
    () => shannonCapacityBps(link.bandwidthHz, Math.max(irsSnr, directSnr)) / 1e9,
    [directSnr, irsSnr, link.bandwidthHz],
  );

  const crossover = React.useMemo(
    () => data.find((point) => point.snr >= point.baselineSnr)?.elements ?? null,
    [data],
  );

  return (
    <Card>
      <h3 className="text-xl font-semibold mb-4">IRS Link Budget Simulator</h3>
      <p className="mb-6 text-secondary dark:text-gray-400">
        A reconfigurable intelligent surface reflects the signal around a blockage. Because it is
        passive the path pays free-space loss twice, but N elements combining coherently give an
        N&sup2; power gain &mdash; 20&middot;log&#8321;&#8320;(N) dB. The interesting question is
        how many elements it takes to win.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-4">
          <div>
            <label htmlFor="elements" className="block mb-2">
              IRS elements: {numElements}
            </label>
            <input
              id="elements"
              type="range"
              min="4"
              max="256"
              step="4"
              value={numElements}
              onChange={(e) => setNumElements(Number(e.target.value))}
              className="w-full"
              aria-label={`Number of IRS elements: ${numElements}`}
            />
          </div>

          <div>
            <label htmlFor="band" className="block mb-2">
              Carrier frequency
            </label>
            <select
              id="band"
              value={bandIndex}
              onChange={(e) => setBandIndex(Number(e.target.value))}
              className="w-full p-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600"
            >
              {BANDS.map((band, index) => (
                <option key={band.label} value={index}>
                  {band.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="distance" className="block mb-2">
              Transmitter to receiver: {distance} m
            </label>
            <input
              id="distance"
              type="range"
              min="10"
              max="200"
              value={distance}
              onChange={(e) => setDistance(Number(e.target.value))}
              className="w-full"
              aria-label={`Distance in metres: ${distance}`}
            />
          </div>

          <div>
            <label htmlFor="power" className="block mb-2">
              Transmit power: {txPowerDbm} dBm
            </label>
            <input
              id="power"
              type="range"
              min="0"
              max="30"
              value={txPowerDbm}
              onChange={(e) => setTxPowerDbm(Number(e.target.value))}
              className="w-full"
              aria-label={`Transmit power in dBm: ${txPowerDbm}`}
            />
          </div>

          <div>
            <label htmlFor="blockage" className="block mb-2">
              Blockage on the direct path: {blockageDb} dB
            </label>
            <input
              id="blockage"
              type="range"
              min="0"
              max="60"
              value={blockageDb}
              onChange={(e) => setBlockageDb(Number(e.target.value))}
              className="w-full"
              aria-label={`Direct path blockage in dB: ${blockageDb}`}
            />
          </div>

          <div className="p-4 bg-background-light dark:bg-background-dark rounded-lg space-y-1">
            <div className="flex justify-between">
              <span className="font-semibold">Via the IRS:</span>
              <span className="text-2xl font-bold text-primary">{irsSnr.toFixed(1)} dB</span>
            </div>
            <div className="flex justify-between text-sm text-secondary dark:text-gray-400">
              <span>Direct path (blocked):</span>
              <span className="font-mono">{directSnr.toFixed(1)} dB</span>
            </div>
            <div className="flex justify-between text-sm text-secondary dark:text-gray-400">
              <span>Shannon capacity over 100 MHz:</span>
              <span className="font-mono">{capacityGbps.toFixed(2)} Gbit/s</span>
            </div>
          </div>

          <p className="text-xs text-secondary dark:text-gray-400">
            {crossover === null
              ? 'At these settings the surface never beats the direct path — the double path loss is too severe. Raise the blockage or the element count.'
              : `The surface overtakes the blocked direct path at about ${crossover} elements. Doubling the elements from there adds 6 dB, not 3 — that is the N² law.`}
          </p>
        </div>

        <div>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="elements"
                scale="log"
                domain={['dataMin', 'dataMax']}
                type="number"
                ticks={[1, 2, 4, 8, 16, 32, 64, 128, 256]}
                label={{ value: 'IRS elements (log scale)', position: 'insideBottom', offset: -12 }}
              />
              <YAxis
                label={{ value: 'SNR (dB)', angle: -90, position: 'insideLeft' }}
                tickFormatter={(value) => Number(value).toFixed(0)}
              />
              <Tooltip formatter={(value) => `${Number(value).toFixed(1)} dB`} />
              <Legend verticalAlign="top" />
              <Line
                type="monotone"
                dataKey="snr"
                name="Via IRS"
                stroke="#0D6EFD"
                dot={false}
                activeDot={{ r: 6 }}
              />
              <Line
                type="monotone"
                dataKey="baselineSnr"
                name="Direct (blocked)"
                stroke="#6C757D"
                strokeDasharray="5 5"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
};

const Tools: React.FC = () => {
  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-3xl font-bold">Interactive tools</h1>
        <p className="mt-2 max-w-3xl text-secondary dark:text-gray-400">
          Standalone simulators, each exploring one idea in isolation. They are quicker to reach for
          than a full experiment and they do not record anything — for a measured result with a
          report and a seed, use the{' '}
          <Link to="/experiments" className="font-semibold text-primary hover:underline">
            experiment catalogue
          </Link>
          .
        </p>
      </div>
      
      <section>
        <h2 className="text-2xl font-bold mb-4 border-b pb-2 border-primary">Knowledge Bank module 4 — semantic communication</h2>
        <div className="space-y-8 mt-4">
            <SemanticCommunicationSimulator />
            <AutoencoderVisualizer />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4 border-b pb-2 border-primary">Knowledge Bank module 5 — joint source-channel coding</h2>
         <div className="space-y-8 mt-4">
            <JSCCSimulator />
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4 border-b pb-2 border-primary">Knowledge Bank module 3 — intelligent reflecting surfaces</h2>
        <div className="space-y-8 mt-4">
            <IrsSimulator />
            <Card>
                <h3 className="text-xl font-semibold mb-4">3D Visualization: IRS in Action</h3>
                <p className="mb-4 text-secondary dark:text-gray-400">
                    This is a 3D representation of an IRS-assisted communication link. Click on elements to see their phase shifts. You can rotate, pan, and zoom the scene.
                </p>
                <LazyThreeScene />
            </Card>
        </div>
      </section>
    </div>
  );
};

export default Tools;