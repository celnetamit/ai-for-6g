import React, { useCallback, useEffect, useRef, useState } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';

const CANVAS_SIZE = 112; // 28 * 4
const LATENT_DIM = 8;
const STROKE_WIDTH = 10;

type CanvasRef = React.RefObject<HTMLCanvasElement | null>;

const contextOf = (ref: CanvasRef): CanvasRenderingContext2D | null =>
  ref.current?.getContext('2d', { willReadFrequently: true }) ?? null;

const clearTo = (ctx: CanvasRenderingContext2D | null): void => {
  if (!ctx) return;
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
};

const AutoencoderVisualizer: React.FC = () => {
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const latentCanvasRef = useRef<HTMLCanvasElement>(null);
  const reconstructCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const [hasDrawing, setHasDrawing] = useState(false);

  useEffect(() => {
    clearTo(contextOf(drawCanvasRef));
    clearTo(contextOf(latentCanvasRef));
    clearTo(contextOf(reconstructCanvasRef));
  }, []);

  /**
   * Encodes the drawing into a latent vector and renders both the vector and a
   * reconstruction.
   *
   * The binning here indexes by *pixel*, not by byte. The previous version used
   * `latentVector[i % LATENT_DIM]` where `i` walks the RGBA buffer in steps of
   * four — so `i % 8` only ever produced 0 or 4, and six of the eight bars were
   * permanently empty regardless of what the learner drew.
   */
  const simulate = useCallback(() => {
    const drawCtx = contextOf(drawCanvasRef);
    const latentCtx = contextOf(latentCanvasRef);
    const reconstructCtx = contextOf(reconstructCanvasRef);
    const drawCanvas = drawCanvasRef.current;
    if (!drawCtx || !latentCtx || !reconstructCtx || !drawCanvas) return;

    const { data } = drawCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    // Each latent unit summarises one vertical band of the image, which makes
    // the bars respond legibly to where the learner drew.
    const latentVector = new Array<number>(LATENT_DIM).fill(0);
    const bandWidth = CANVAS_SIZE / LATENT_DIM;

    for (let pixel = 0; pixel < CANVAS_SIZE * CANVAS_SIZE; pixel += 1) {
      const intensity = data[pixel * 4] ?? 0; // red channel; strokes are white
      if (intensity === 0) continue;
      const x = pixel % CANVAS_SIZE;
      const band = Math.min(LATENT_DIM - 1, Math.floor(x / bandWidth));
      latentVector[band] = (latentVector[band] ?? 0) + intensity;
    }

    clearTo(latentCtx);
    const maxValue = Math.max(...latentVector, 1);
    latentVector.forEach((value, index) => {
      const normalized = value / maxValue;
      const height = normalized * CANVAS_SIZE;
      latentCtx.fillStyle = `hsl(${180 + normalized * 60}, 100%, 50%)`;
      latentCtx.fillRect(index * bandWidth, CANVAS_SIZE - height, bandWidth - 1, height);
    });

    clearTo(reconstructCtx);
    reconstructCtx.globalAlpha = 0.8;
    reconstructCtx.filter = 'blur(2px)';
    reconstructCtx.drawImage(drawCanvas, 0, 0);
    reconstructCtx.filter = 'none';
    reconstructCtx.globalAlpha = 1;
  }, []);

  /**
   * Maps a pointer position to canvas coordinates.
   *
   * The canvas is laid out with `w-full max-w-[112px]`, so its CSS size does not
   * match its bitmap size on narrow screens. Without this scale factor the
   * stroke lands away from the cursor on mobile.
   */
  const positionFrom = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  // Pointer events rather than mouse events: the workshop runs on tablets, where
  // the mouse-only handlers meant the canvas could not be drawn on at all.
  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = contextOf(drawCanvasRef);
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    isDrawingRef.current = true;

    const { x, y } = positionFrom(event);
    ctx.strokeStyle = 'white';
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A tap with no movement should still leave a mark.
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const ctx = contextOf(drawCanvasRef);
    if (!ctx) return;
    const { x, y } = positionFrom(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    contextOf(drawCanvasRef)?.closePath();
    setHasDrawing(true);
    simulate();
  };

  const clearCanvas = useCallback(() => {
    clearTo(contextOf(drawCanvasRef));
    clearTo(contextOf(latentCanvasRef));
    clearTo(contextOf(reconstructCanvasRef));
    setHasDrawing(false);
  }, []);

  return (
    <Card>
      <h3 className="text-xl font-semibold mb-2">Autoencoder Visualizer</h3>
      <p className="mb-6 text-secondary dark:text-gray-400">
        Draw a digit (e.g. 7, 1, 0) to see a simplified simulation of how an autoencoder extracts a
        compact &ldquo;semantic&rdquo; representation (latent vector) and then reconstructs the image.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center text-center">
        <div>
          <h4 className="font-semibold mb-2">1. Your Drawing</h4>
          <canvas
            ref={drawCanvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            // `touch-none` stops the browser scrolling the page instead of drawing.
            className="w-full max-w-[112px] mx-auto h-auto border-2 border-primary rounded-md cursor-crosshair touch-none"
            aria-label="Drawing canvas: draw a digit here"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
        </div>
        <div>
          <h4 className="font-semibold mb-2">2. Encoded (Latent Vector)</h4>
          <canvas
            ref={latentCanvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="w-full max-w-[112px] mx-auto h-auto border-2 border-gray-300 dark:border-gray-600 rounded-md"
            aria-label="Latent vector visualization"
          />
        </div>
        <div>
          <h4 className="font-semibold mb-2">3. Reconstructed</h4>
          <canvas
            ref={reconstructCanvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            className="w-full max-w-[112px] mx-auto h-auto border-2 border-gray-300 dark:border-gray-600 rounded-md"
            aria-label="Reconstructed image"
          />
        </div>
      </div>

      <div className="text-center mt-6">
        <Button onClick={clearCanvas} variant="secondary" disabled={!hasDrawing}>
          Clear
        </Button>
      </div>
    </Card>
  );
};

export default AutoencoderVisualizer;
