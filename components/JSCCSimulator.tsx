import React, { useMemo, useState } from 'react';
import Card from './ui/Card';
import {
  bitsToText,
  bpskBer,
  makeRng,
  noisePercentToEbN0Db,
  textToBits,
  transmitBits,
} from '../lib/channel';

/**
 * Separate source/channel coding versus joint source-channel coding.
 *
 * The previous version was not a simulation of anything. Its "AI-powered JSCC
 * model" was a four-entry lookup table:
 *
 *     const replacements = { networks: 'systems', enhance: 'improve',
 *                            can: 'will', '6G': 'future' };
 *
 * hardcoded against the words of the default sentence. Type anything else and
 * every corrupted word became a literal `'...'`. Worse, the comparison was
 * rigged: the traditional path had each *bit* flipped with probability
 * `noise/100` while the JSCC path had each *word* perturbed. Those are not the
 * same channel, so JSCC won by construction — the demonstration could not have
 * come out any other way, whatever the physics.
 *
 * Both paths now ride the identical channel: the same BER from the same
 * Eb/N0. What differs is the code:
 *
 *   - **Separate coding** sends 8 bits per character with no protection, so a
 *     single flipped bit silently changes a character, and errors are
 *     independent and unbounded. This is the real failure mode of an
 *     uncoded link and it is genuinely ugly.
 *   - **JSCC** sends each character with a repetition code and majority-votes
 *     at the receiver. That is a real joint scheme — crude, but an actual one —
 *     so its improvement is *earned*: majority-of-three fails only when two of
 *     three bits flip, giving 3p²(1−p) + p³ instead of p.
 *
 * The panel shows the residual error rate for each so the learner can check the
 * arithmetic against what they see.
 */

const REPETITION = 3;

/** Majority vote over `REPETITION` copies of each bit. */
function majorityDecode(received: string, repetition: number): string {
  let decoded = '';
  for (let i = 0; i + repetition <= received.length; i += repetition) {
    let ones = 0;
    for (let k = 0; k < repetition; k += 1) if (received[i + k] === '1') ones += 1;
    decoded += ones * 2 > repetition ? '1' : '0';
  }
  return decoded;
}

/** Residual BER after majority-of-three: 3p²(1−p) + p³. */
const repetitionResidualBer = (p: number): number => 3 * p * p * (1 - p) + p * p * p;

/** Renders control characters so a corrupted byte is visible rather than invisible. */
const printable = (text: string): string =>
  Array.from(text)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 32 || code === 127 ? '░' : ch;
    })
    .join('');

const JSCCSimulator: React.FC = () => {
  const [noiseLevel, setNoiseLevel] = useState(10);
  const [inputText, setInputText] = useState('AI can enhance 6G networks.');

  const ebN0Db = useMemo(() => noisePercentToEbN0Db(noiseLevel), [noiseLevel]);
  const ber = useMemo(() => bpskBer(ebN0Db), [ebN0Db]);

  const result = useMemo(() => {
    const bits = textToBits(inputText);

    // Seeded on the inputs so the output is stable while the learner reads it,
    // and identical for both paths' channel draws.
    const separateRng = makeRng(noiseLevel * 104729 + inputText.length * 31 + 1);
    const jointRng = makeRng(noiseLevel * 104729 + inputText.length * 31 + 2);

    const separate = transmitBits(bits, ber, separateRng);

    const expanded = Array.from(bits)
      .map((bit) => bit.repeat(REPETITION))
      .join('');
    const jointReceived = transmitBits(expanded, ber, jointRng);
    const jointDecoded = majorityDecode(jointReceived.received, REPETITION);

    const residualErrors = Array.from(bits).reduce(
      (count, bit, index) => count + (jointDecoded[index] === bit ? 0 : 1),
      0,
    );

    return {
      separateText: bitsToText(separate.received),
      jointText: bitsToText(jointDecoded),
      separateErrors: separate.flipped,
      jointErrors: residualErrors,
      totalBits: bits.length,
      /** Bits actually put on the channel — JSCC spends three times as many. */
      separateChannelBits: bits.length,
      jointChannelBits: expanded.length,
    };
  }, [ber, inputText, noiseLevel]);

  return (
    <Card>
      <h3 className="text-xl font-semibold mb-2">Joint Source-Channel Coding (JSCC) Simulator</h3>
      <p className="mb-6 text-secondary dark:text-gray-400">
        The same text over the same channel, coded two ways. Uncoded transmission spends one channel
        bit per source bit; the joint scheme spends three and majority-votes at the receiver. The
        improvement is paid for in bandwidth — it is not free.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label htmlFor="inputText" className="block mb-2 font-semibold">
            Input text:
          </label>
          <input
            id="inputText"
            type="text"
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            className="w-full p-2 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600"
          />
        </div>
        <div>
          <label htmlFor="jscc-noise" className="block mb-2 font-semibold">
            Channel noise: {noiseLevel}%
            <span className="ml-2 font-normal text-secondary dark:text-gray-400">
              (E<sub>b</sub>/N<sub>0</sub> = {ebN0Db.toFixed(1)} dB)
            </span>
          </label>
          <input
            id="jscc-noise"
            type="range"
            min="0"
            max="100"
            value={noiseLevel}
            onChange={(event) => setNoiseLevel(Number(event.target.value))}
            className="w-full"
          />
          <p className="mt-1 text-xs text-secondary dark:text-gray-400">
            Channel BER:{' '}
            <span className="font-mono font-semibold">
              {ber < 1e-4 ? ber.toExponential(2) : (ber * 100).toFixed(2) + '%'}
            </span>
            {' · '}after majority-of-3:{' '}
            <span className="font-mono font-semibold">
              {repetitionResidualBer(ber) < 1e-4
                ? repetitionResidualBer(ber).toExponential(2)
                : (repetitionResidualBer(ber) * 100).toFixed(2) + '%'}
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-4 rounded-lg bg-background-light dark:bg-background-dark">
          <h4 className="font-semibold text-lg mb-2">Uncoded (separate source/channel)</h4>
          <p className="font-mono text-sm text-red-500 min-h-[6em] p-2 bg-white dark:bg-black rounded break-all whitespace-pre-wrap">
            {printable(result.separateText)}
          </p>
          <p className="text-xs mt-2 text-secondary dark:text-gray-500">
            {result.separateErrors} of {result.totalBits} bits flipped, using{' '}
            {result.separateChannelBits} channel bits.
          </p>
        </div>
        <div className="p-4 rounded-lg bg-background-light dark:bg-background-dark">
          <h4 className="font-semibold text-lg mb-2">Joint coding (repetition-3)</h4>
          <p className="font-mono text-sm text-green-500 min-h-[6em] p-2 bg-white dark:bg-black rounded break-all whitespace-pre-wrap">
            {printable(result.jointText)}
          </p>
          <p className="text-xs mt-2 text-secondary dark:text-gray-500">
            {result.jointErrors} of {result.totalBits} bits wrong after decoding, using{' '}
            {result.jointChannelBits} channel bits.
          </p>
        </div>
      </div>

      <p className="mt-6 text-xs text-secondary dark:text-gray-400">
        Repetition coding is deliberately the simplest real code there is, so the gain can be checked
        by hand: majority-of-three fails only when at least two of three bits flip, which is
        3p²(1−p) + p³ rather than p. Note also where it stops helping — past a channel BER of 50% the
        majority vote is worse than useless, which is why practical systems pair stronger codes with
        modulation rather than simply repeating.
      </p>
    </Card>
  );
};

export default JSCCSimulator;
