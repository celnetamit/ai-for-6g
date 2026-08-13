import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';
import { useProgress } from '../context/ProgressContext';
import { bpskBer, makeRng, noisePercentToEbN0Db } from '../lib/channel';
import { globalSsim } from '../lib/imageMetrics';
import { SAMPLE_BOXES, SAMPLE_LABELS, SAMPLE_NAMES, drawSample, type SampleName } from '../lib/sampleImages';

const SIZE = 96;

/**
 * The capstone: transmit a scene, then try to detect the object in what arrives.
 *
 * This is the assessed activity, and it was the least defensible screen in the
 * app. Its two scores were:
 *
 *     const traditionalAccuracy = Math.max(0, 98.0 - (noiseLevel * 2.2));
 *     const semanticAccuracy    = Math.max(0, 98.0 - (noiseLevel * 0.9));
 *
 * Two straight lines with invented slopes, rendered to one decimal place, drawn
 * over bounding boxes at hardcoded coordinates that corresponded to nothing —
 * and on top of two blank canvases, because the base64 images they were drawn
 * over were malformed PNGs that never decoded. That number was then written
 * into the learner's saved progress via `saveCapstoneResult` as their result.
 *
 * Now: the same channel model as the rest of the app drives real bit errors,
 * the boxes are the true extents of the drawn object, and the score is
 * *measured* — structural similarity inside the object region, between what was
 * received and the clean reference. It is a proxy for detector confidence
 * rather than a detector, and the UI says exactly that.
 */

interface CapstoneResult {
  noiseLevel: number;
  traditionalAccuracy: number;
  semanticAccuracy: number;
  completedOn: string;
}

/** Renders a clean reference off-screen so received frames can be compared to it. */
function referenceContext(name: SampleName): CanvasRenderingContext2D | null {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  drawSample(ctx, name, SIZE);
  return ctx;
}

const CapstoneSimulator: React.FC = () => {
  const { progress, saveCapstoneResult } = useProgress();
  const [selectedImage, setSelectedImage] = useState<SampleName>('car');
  const [noiseLevel, setNoiseLevel] = useState(progress.capstoneResult?.noiseLevel ?? 40);
  const [results, setResults] = useState<CapstoneResult | null>(progress.capstoneResult ?? null);
  const [isRunning, setIsRunning] = useState(false);

  const traditionalRef = useRef<HTMLCanvasElement>(null);
  const semanticRef = useRef<HTMLCanvasElement>(null);

  const ebN0Db = useMemo(() => noisePercentToEbN0Db(noiseLevel), [noiseLevel]);
  const ber = useMemo(() => bpskBer(ebN0Db), [ebN0Db]);

  const box = SAMPLE_BOXES[selectedImage];

  const drawBoundingBox = useCallback(
    (ctx: CanvasRenderingContext2D, confidence: number) => {
      const x = box.x * SIZE;
      const y = box.y * SIZE;
      const w = box.w * SIZE;
      const h = box.h * SIZE;
      const colour = confidence > 50 ? '#10B981' : '#EF4444';

      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = colour;
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText(`${SAMPLE_LABELS[selectedImage]}: ${confidence.toFixed(1)}%`, x + 2, Math.max(10, y - 3));
    },
    [box, selectedImage],
  );

  /** SSIM inside the object's bounding box, as a percentage. */
  const regionScore = useCallback(
    (reference: CanvasRenderingContext2D, received: CanvasRenderingContext2D): number => {
      const x = Math.floor(box.x * SIZE);
      const y = Math.floor(box.y * SIZE);
      const w = Math.max(1, Math.floor(box.w * SIZE));
      const h = Math.max(1, Math.floor(box.h * SIZE));
      const a = reference.getImageData(x, y, w, h).data;
      const b = received.getImageData(x, y, w, h).data;
      return Math.min(100, Math.max(0, globalSsim(a, b) * 100));
    },
    [box],
  );

  const render = useCallback(
    (withScores: boolean) => {
      const traditionalCtx = traditionalRef.current?.getContext('2d', { willReadFrequently: true });
      const semanticCtx = semanticRef.current?.getContext('2d', { willReadFrequently: true });
      const reference = referenceContext(selectedImage);
      if (!traditionalCtx || !semanticCtx || !reference) return null;

      const rng = makeRng(noiseLevel * 7907 + (selectedImage === 'cat' ? 3 : 5));

      // Bit-level path: every colour channel is eight bits on the wire.
      drawSample(traditionalCtx, selectedImage, SIZE);
      const frame = traditionalCtx.getImageData(0, 0, SIZE, SIZE);
      for (let i = 0; i < frame.data.length; i += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          let value = frame.data[i + channel] ?? 0;
          for (let bit = 0; bit < 8; bit += 1) if (rng() < ber) value ^= 1 << bit;
          frame.data[i + channel] = value;
        }
      }
      traditionalCtx.putImageData(frame, 0, 0);

      // Semantic path: a compact descriptor, re-rendered. Far fewer bits at the
      // same BER, so far more likely to arrive intact.
      const descriptorIntact = (1 - ber) ** 64;
      const lost = rng() > descriptorIntact;
      semanticCtx.clearRect(0, 0, SIZE, SIZE);
      if (lost) {
        const other = SAMPLE_NAMES.find((n) => n !== selectedImage) ?? selectedImage;
        drawSample(semanticCtx, other, SIZE);
      } else {
        drawSample(semanticCtx, selectedImage, SIZE);
        semanticCtx.save();
        semanticCtx.globalAlpha = 0.5;
        semanticCtx.filter = 'blur(1.2px)';
        drawSample(semanticCtx, selectedImage, SIZE);
        semanticCtx.restore();
      }

      if (!withScores) return null;

      const traditionalAccuracy = regionScore(reference, traditionalCtx);
      const semanticAccuracy = regionScore(reference, semanticCtx);

      drawBoundingBox(traditionalCtx, traditionalAccuracy);
      drawBoundingBox(semanticCtx, semanticAccuracy);

      return { traditionalAccuracy, semanticAccuracy };
    },
    [ber, drawBoundingBox, noiseLevel, regionScore, selectedImage],
  );

  const runSimulation = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    setResults(null);

    // A short delay so the state change is visible; the work itself is fast.
    window.setTimeout(() => {
      try {
        const scores = render(true);
        if (scores) {
          const finalResult: CapstoneResult = {
            noiseLevel,
            ...scores,
            completedOn: new Date().toISOString(),
          };
          setResults(finalResult);
          saveCapstoneResult(finalResult);
        }
      } finally {
        setIsRunning(false);
      }
    }, 400);
  }, [isRunning, noiseLevel, render, saveCapstoneResult]);

  /*
   * Preview whenever the inputs change, without scoring. The previous version
   * had two effects with `eslint-disable react-hooks/exhaustive-deps`, one
   * keyed on the image and one on the noise, both calling a `runSimulation`
   * that closed over stale state — so the canvases and the numbers could
   * disagree about which settings they represented.
   */
  useEffect(() => {
    render(false);
  }, [render]);

  return (
    <Card>
      <h2 className="text-2xl font-semibold mb-2">Capstone Simulator</h2>
      <p className="mb-6 text-secondary dark:text-gray-400">
        Transmit a scene over a noisy channel two ways, then measure how much of the object survived
        inside its bounding box.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <span className="block mb-2 font-semibold">Select image:</span>
          <div className="flex gap-2">
            {SAMPLE_NAMES.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setSelectedImage(name)}
                aria-pressed={selectedImage === name}
                className={`px-3 py-1 text-sm rounded-full transition-colors ${
                  selectedImage === name ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              >
                {SAMPLE_LABELS[name]}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label htmlFor="capstone-noise" className="block mb-2 font-semibold">
            Channel noise: {noiseLevel}%
            <span className="ml-2 font-normal text-secondary dark:text-gray-400">
              (BER {ber < 1e-4 ? ber.toExponential(1) : (ber * 100).toFixed(2) + '%'})
            </span>
          </label>
          <input
            id="capstone-noise"
            type="range"
            min="0"
            max="100"
            value={noiseLevel}
            onChange={(event) => setNoiseLevel(Number(event.target.value))}
            className="w-full"
            disabled={isRunning}
          />
        </div>
      </div>

      <div className="text-center mb-6">
        <Button onClick={runSimulation} disabled={isRunning}>
          {isRunning ? 'Running simulation…' : 'Run simulation & evaluate'}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {(
          [
            ['Traditional system output', traditionalRef, results?.traditionalAccuracy],
            ['Semantic system output', semanticRef, results?.semanticAccuracy],
          ] as const
        ).map(([title, ref, score]) => (
          <div key={title}>
            <h4 className="font-semibold text-lg mb-2 text-center">{title}</h4>
            <canvas
              ref={ref}
              width={SIZE}
              height={SIZE}
              aria-label={title}
              className="w-full h-auto border-2 border-gray-300 dark:border-gray-600 rounded-md"
              style={{ imageRendering: 'pixelated' }}
            />
            <div className="mt-2 text-center p-2 rounded-md bg-background-light dark:bg-background-dark">
              <h5 className="font-semibold text-sm">Detection confidence proxy</h5>
              <p
                className={`text-3xl font-bold ${
                  score !== undefined && score < 50 ? 'text-red-500' : 'text-green-500'
                }`}
              >
                {score !== undefined ? `${score.toFixed(1)}%` : '—'}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-6 text-xs text-secondary dark:text-gray-400">
        The score is structural similarity between the received frame and the clean original, taken
        inside the object&rsquo;s bounding box. It is a stand-in for a detector&rsquo;s confidence,
        not a detector — no network is run here. It is reported because it is measured from the
        pixels you can see, so you can check it: raise the noise and watch the bit-level score fall
        faster than the semantic one, and note what happens when the semantic descriptor is lost
        entirely.
      </p>
    </Card>
  );
};

export default CapstoneSimulator;
