import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from './ui/Card';
import { bpskBer, makeRng, noisePercentToEbN0Db } from '../lib/channel';
import { globalSsim, psnrDb } from '../lib/imageMetrics';
import { SAMPLE_LABELS, SAMPLE_NAMES, drawSample, referencePixels, type SampleName } from '../lib/sampleImages';

const CANVAS_SIZE = 96;

/**
 * Sends one image two ways over the same channel and measures what arrives.
 *
 * What this replaces, all of it verified in a headless browser:
 *
 *   - Both canvases rendered **blank**. The two embedded base64 "images" were
 *     malformed PNGs — bad IDAT CRC, no IEND — so `img.onerror` fired and
 *     nothing was ever drawn. The headline simulator of Module 2 displayed two
 *     empty boxes.
 *   - `bitErrorRate = noiseLevel * 2.5` reported **250%** at full noise. A bit
 *     error rate is a probability.
 *   - `objectRecognitionConfidence = 100 - noiseLevel * 0.8` was a straight
 *     line with an invented slope; no recognition of any kind took place.
 *   - The two paths were not comparable. The traditional canvas got per-pixel
 *     random replacement while the "semantic" canvas got a CSS blur, so the
 *     semantic side won by construction rather than for any reason a student
 *     could learn from.
 *
 * Both paths now face the *same* channel: a BER derived from Eb/N0 through the
 * BPSK waterfall. The difference between them is what each path chooses to
 * spend its bits on, which is the actual idea:
 *
 *   - the bit-level path transmits raw pixels, so a flipped bit corrupts a
 *     pixel and errors accumulate with no structure;
 *   - the semantic path transmits a small feature description and re-renders
 *     the scene from it, so it degrades in resolution rather than in meaning,
 *     and fails abruptly only when the description itself is corrupted.
 *
 * The scores are then *measured* — PSNR and a global SSIM against the clean
 * reference — not asserted.
 */
const SemanticCommunicationSimulator: React.FC = () => {
  const [selected, setSelected] = useState<SampleName>('cat');
  const [noiseLevel, setNoiseLevel] = useState(20);
  const [metrics, setMetrics] = useState({ ber: 0, psnr: 0, ssimBits: 1, ssimSemantic: 1 });

  const traditionalRef = useRef<HTMLCanvasElement>(null);
  const semanticRef = useRef<HTMLCanvasElement>(null);

  const ebN0Db = useMemo(() => noisePercentToEbN0Db(noiseLevel), [noiseLevel]);
  const ber = useMemo(() => bpskBer(ebN0Db), [ebN0Db]);

  const run = useCallback(() => {
    const traditionalCtx = traditionalRef.current?.getContext('2d', { willReadFrequently: true });
    const semanticCtx = semanticRef.current?.getContext('2d', { willReadFrequently: true });
    if (!traditionalCtx || !semanticCtx) return;

    const reference = referencePixels(selected, CANVAS_SIZE);
    if (!reference) return;

    // Seeded on the inputs, so the same settings always give the same channel
    // realisation. Without this every unrelated re-render redrew different
    // noise and the numbers flickered while the learner read them.
    const rng = makeRng(noiseLevel * 7919 + (selected === 'cat' ? 17 : 23));

    // ---- bit-level path: transmit the pixels, flip bits at the channel BER.
    drawSample(traditionalCtx, selected, CANVAS_SIZE);
    const received = traditionalCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const pixels = received.data;
    for (let i = 0; i < pixels.length; i += 4) {
      for (let channel = 0; channel < 3; channel += 1) {
        let value = pixels[i + channel] ?? 0;
        // Eight bits per channel, each independently at risk.
        for (let bit = 0; bit < 8; bit += 1) {
          if (rng() < ber) value ^= 1 << bit;
        }
        pixels[i + channel] = value;
      }
    }
    traditionalCtx.putImageData(received, 0, 0);

    // ---- semantic path: transmit a compact description and re-render from it.
    //
    // The description is a handful of numbers (which object, and a coarse
    // colour/scale summary), so it occupies far fewer bits. Fewer bits at the
    // same BER means a far lower chance that any of them is wrong — that is the
    // entire coding-gain argument, and it is now arithmetic rather than
    // assertion. The cost is resolution: the re-render is an idealisation, so
    // fine detail is lost even on a perfect channel.
    const descriptorBits = 64;
    const descriptorIntact = (1 - ber) ** descriptorBits;
    const descriptorCorrupted = rng() > descriptorIntact;

    semanticCtx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (descriptorCorrupted) {
      // A corrupted descriptor is not a slightly worse picture — it is the
      // wrong picture. Semantic systems fail differently, not gracefully
      // forever, and hiding that would be its own dishonesty.
      const other = SAMPLE_NAMES.find((name) => name !== selected) ?? selected;
      drawSample(semanticCtx, other, CANVAS_SIZE);
      semanticCtx.fillStyle = 'rgba(220, 38, 38, 0.28)';
      semanticCtx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    } else {
      // Re-rendered cleanly, then softened to represent the detail the compact
      // description could not carry.
      drawSample(semanticCtx, selected, CANVAS_SIZE);
      semanticCtx.save();
      semanticCtx.globalAlpha = 0.55;
      semanticCtx.filter = 'blur(1.2px)';
      drawSample(semanticCtx, selected, CANVAS_SIZE);
      semanticCtx.restore();
    }

    const bitsPixels = traditionalCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;
    const semanticPixels = semanticCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE).data;

    const measuredPsnr = psnrDb(reference, bitsPixels);
    setMetrics({
      ber,
      psnr: Number.isFinite(measuredPsnr) ? measuredPsnr : 99,
      ssimBits: globalSsim(reference, bitsPixels),
      ssimSemantic: globalSsim(reference, semanticPixels),
    });
  }, [ber, noiseLevel, selected]);

  // Explicit dependencies. The previous version called its redraw from an
  // effect with *no* dependency array, so it re-ran after every render of the
  // page for any reason at all.
  useEffect(() => {
    run();
  }, [run]);

  return (
    <Card>
      <h3 className="text-xl font-semibold mb-2">Semantic Communication Simulator</h3>
      <p className="mb-6 text-secondary dark:text-gray-400">
        The same image over the same channel, sent two ways. The bit-level path transmits pixels; the
        semantic path transmits a short description and re-renders the scene. Scores are measured
        against the clean original, not assumed.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <span className="block mb-2 font-semibold">Select image:</span>
          <div className="flex gap-2">
            {SAMPLE_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setSelected(name)}
                aria-pressed={selected === name}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  selected === name ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                {SAMPLE_LABELS[name]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="noise" className="block mb-2 font-semibold">
            Channel noise: {noiseLevel}%
            <span className="ml-2 font-normal text-secondary dark:text-gray-400">
              (E<sub>b</sub>/N<sub>0</sub> = {ebN0Db.toFixed(1)} dB)
            </span>
          </label>
          <input
            id="noise"
            type="range"
            min="0"
            max="100"
            value={noiseLevel}
            onChange={(event) => setNoiseLevel(Number(event.target.value))}
            className="w-full"
          />
          <p className="mt-1 text-xs text-secondary dark:text-gray-400">
            BPSK bit error rate:{' '}
            <span className="font-mono font-semibold">
              {metrics.ber < 1e-4 ? metrics.ber.toExponential(2) : (metrics.ber * 100).toFixed(2) + '%'}
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h4 className="font-semibold text-lg mb-2 text-center">Bit-level transmission</h4>
          <canvas
            ref={traditionalRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            aria-label="Image received over a bit-level link"
            className="w-full h-auto border-2 border-gray-300 dark:border-gray-600 rounded-md"
            style={{ imageRendering: 'pixelated' }}
          />
          <dl className="mt-2 text-center text-sm">
            <div>
              <dt className="inline text-secondary dark:text-gray-400">PSNR: </dt>
              <dd className="inline font-bold text-red-500">
                {metrics.psnr >= 99 ? '∞' : `${metrics.psnr.toFixed(1)} dB`}
              </dd>
            </div>
            <div>
              <dt className="inline text-secondary dark:text-gray-400">Structural similarity: </dt>
              <dd className="inline font-bold text-red-500">{metrics.ssimBits.toFixed(3)}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h4 className="font-semibold text-lg mb-2 text-center">Semantic transmission</h4>
          <canvas
            ref={semanticRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            aria-label="Image reconstructed from a semantic description"
            className="w-full h-auto border-2 border-gray-300 dark:border-gray-600 rounded-md"
            style={{ imageRendering: 'pixelated' }}
          />
          <dl className="mt-2 text-center text-sm">
            <div>
              <dt className="inline text-secondary dark:text-gray-400">Structural similarity: </dt>
              <dd className="inline font-bold text-green-500">{metrics.ssimSemantic.toFixed(3)}</dd>
            </div>
            <div className="text-xs text-secondary dark:text-gray-400">
              descriptor survives with probability {((1 - metrics.ber) ** 64 * 100).toFixed(1)}%
            </div>
          </dl>
        </div>
      </div>

      <p className="mt-6 text-xs text-secondary dark:text-gray-400">
        Push the noise past about 80% and the semantic path does not blur — it reconstructs the wrong
        object outright. Fewer bits means a much better chance of arriving intact, but when the
        description itself is corrupted the failure is total rather than gradual. That trade is the
        open problem in semantic communication, not a detail.
      </p>
    </Card>
  );
};

export default SemanticCommunicationSimulator;
