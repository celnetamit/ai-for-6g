/**
 * The sample images the transmission simulators send.
 *
 * These replace two base64 data URIs that were embedded "to ensure offline
 * functionality" and were not valid PNGs at all: the IDAT chunk CRC failed and
 * the stream had no IEND, so `zlib` refused to inflate them. In the browser
 * `img.onerror` fired, `isImageReady` stayed false, and both canvases in the
 * Semantic Communication Simulator rendered permanently blank — verified in a
 * headless browser, where every pixel of both 64x64 canvases was identical.
 * The Capstone Simulator used the same two strings, so its "object detection"
 * drew bounding boxes over nothing.
 *
 * Drawing the samples with canvas primitives instead removes the whole class of
 * problem. There is no asset to corrupt, no network request, no decode step and
 * no load event to race — and the two shapes are now genuinely distinguishable,
 * which matters because the modules ask a learner to judge whether the content
 * survived transmission.
 *
 * The bounding boxes are the real extents of what is drawn, so the detection
 * overlay lines up with the object rather than with an arbitrary rectangle.
 */

export type SampleName = 'cat' | 'car';

export const SAMPLE_NAMES: readonly SampleName[] = ['cat', 'car'];

export const SAMPLE_LABELS: Record<SampleName, string> = {
  cat: 'Cat',
  car: 'Car',
};

/** Ground-truth bounding box, as fractions of the canvas edge. */
export const SAMPLE_BOXES: Record<SampleName, { x: number; y: number; w: number; h: number }> = {
  cat: { x: 0.22, y: 0.16, w: 0.56, h: 0.68 },
  car: { x: 0.08, y: 0.34, w: 0.84, h: 0.42 },
};

/** Fills the background with a flat sky/ground so noise is visible against it. */
function drawBackdrop(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.fillStyle = '#1b2a41';
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = '#24384f';
  ctx.fillRect(0, s * 0.78, s, s * 0.22);
}

function drawCat(ctx: CanvasRenderingContext2D, s: number): void {
  const body = '#e8a33d';
  const dark = '#c07c1f';

  // Tail — drawn first so it sits behind the body.
  ctx.strokeStyle = dark;
  ctx.lineWidth = s * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(s * 0.72, s * 0.74);
  ctx.quadraticCurveTo(s * 0.92, s * 0.66, s * 0.8, s * 0.42);
  ctx.stroke();

  // Body.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(s * 0.5, s * 0.66, s * 0.22, s * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head.
  ctx.beginPath();
  ctx.arc(s * 0.5, s * 0.36, s * 0.17, 0, Math.PI * 2);
  ctx.fill();

  // Ears.
  ctx.beginPath();
  ctx.moveTo(s * 0.36, s * 0.27);
  ctx.lineTo(s * 0.33, s * 0.14);
  ctx.lineTo(s * 0.47, s * 0.22);
  ctx.closePath();
  ctx.moveTo(s * 0.64, s * 0.27);
  ctx.lineTo(s * 0.67, s * 0.14);
  ctx.lineTo(s * 0.53, s * 0.22);
  ctx.closePath();
  ctx.fill();

  // Eyes and nose — small, high-contrast detail that noise destroys first.
  ctx.fillStyle = '#12202f';
  ctx.beginPath();
  ctx.arc(s * 0.44, s * 0.35, s * 0.028, 0, Math.PI * 2);
  ctx.arc(s * 0.56, s * 0.35, s * 0.028, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4d9c0';
  ctx.beginPath();
  ctx.moveTo(s * 0.5, s * 0.42);
  ctx.lineTo(s * 0.47, s * 0.46);
  ctx.lineTo(s * 0.53, s * 0.46);
  ctx.closePath();
  ctx.fill();
}

function drawCar(ctx: CanvasRenderingContext2D, s: number): void {
  const body = '#3f8fd8';
  const glass = '#bfe0f5';

  // Lower body.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(s * 0.08, s * 0.5, s * 0.84, s * 0.2, s * 0.05);
  ctx.fill();

  // Cabin.
  ctx.beginPath();
  ctx.moveTo(s * 0.26, s * 0.5);
  ctx.lineTo(s * 0.36, s * 0.34);
  ctx.lineTo(s * 0.66, s * 0.34);
  ctx.lineTo(s * 0.74, s * 0.5);
  ctx.closePath();
  ctx.fill();

  // Windows.
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.moveTo(s * 0.31, s * 0.48);
  ctx.lineTo(s * 0.38, s * 0.37);
  ctx.lineTo(s * 0.49, s * 0.37);
  ctx.lineTo(s * 0.49, s * 0.48);
  ctx.closePath();
  ctx.moveTo(s * 0.53, s * 0.37);
  ctx.lineTo(s * 0.64, s * 0.37);
  ctx.lineTo(s * 0.7, s * 0.48);
  ctx.lineTo(s * 0.53, s * 0.48);
  ctx.closePath();
  ctx.fill();

  // Wheels.
  ctx.fillStyle = '#1a1a1f';
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.72, s * 0.09, 0, Math.PI * 2);
  ctx.arc(s * 0.72, s * 0.72, s * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8a8a95';
  ctx.beginPath();
  ctx.arc(s * 0.3, s * 0.72, s * 0.035, 0, Math.PI * 2);
  ctx.arc(s * 0.72, s * 0.72, s * 0.035, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Renders a sample onto a square context of edge `size`.
 *
 * Synchronous by design: the previous arrangement had to assign `img.src`,
 * wait for `onload`, guard against the handler firing before it was attached
 * (which data URIs can do), and cancel stale loads when the selection changed.
 * None of that is needed to draw a shape.
 */
export function drawSample(ctx: CanvasRenderingContext2D, name: SampleName, size: number): void {
  ctx.save();
  ctx.clearRect(0, 0, size, size);
  drawBackdrop(ctx, size);
  if (name === 'cat') drawCat(ctx, size);
  else drawCar(ctx, size);
  ctx.restore();
}

/**
 * Returns the pixels of a clean sample, for use as the reference when measuring
 * how much a received image has degraded.
 */
export function referencePixels(name: SampleName, size: number): Uint8ClampedArray | null {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  drawSample(ctx, name, size);
  return ctx.getImageData(0, 0, size, size).data;
}
