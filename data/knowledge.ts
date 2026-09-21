/**
 * The five knowledge-bank modules of spec §3, written across the three
 * learning levels of §2.
 *
 * Every section carries a level. The Knowledge Bank shows a learner the
 * sections at or below their selected level, so the same five modules serve a
 * beginner meeting 6G for the first time and a researcher who wants the
 * scaling law with its reference. That is a different arrangement from three
 * separate curricula, and a better one: the beginner who advances sees the
 * material they already read, extended, rather than a different book.
 *
 * Where a section states a number that this lab can compute, it names the
 * experiment that computes it. Nothing here asks the reader to take a
 * quantitative claim on trust when the engine two clicks away will produce it.
 */

import type { ExperimentId, LearningLevel } from '../lib/experiment';

export interface KnowledgeSection {
  id: string;
  title: string;
  level: LearningLevel;
  /** Markdown. */
  body: string;
  /** An experiment that demonstrates this section, if one does. */
  experiment?: ExperimentId;
}

export interface KnowledgeModule {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  /** One sentence a learner can use to decide whether to read it. */
  promise: string;
  sections: KnowledgeSection[];
}

export const KNOWLEDGE_MODULES: readonly KnowledgeModule[] = [
  {
    id: 'evolution',
    number: 1,
    title: 'Evolution of communication networks',
    subtitle: '3G to 6G',
    promise:
      'What each generation actually changed, and why the changes that made 5G work will not be enough for 6G.',
    sections: [
      {
        id: 'generations',
        title: 'What each generation changed',
        level: 'beginner',
        body: `Mobile generations are usually presented as a table of peak data rates. That table is the least
interesting thing about them, because the peak rate is a consequence and not a cause. What actually
changed each time was **what the network was asked to carry**, and the radio was redesigned around
that answer.

| Generation | The question it answered | The technical move |
| --- | --- | --- |
| 3G (2001) | Can a phone carry data as well as voice? | Wideband CDMA — many users on one wide carrier, separated by codes rather than by frequency. |
| 4G (2009) | Can a phone carry the internet? | OFDM and an all-IP core. The circuit-switched voice path was finally abandoned. |
| 5G (2019) | Can one network serve phones, machines and factories at once? | Three service classes (eMBB, URLLC, mMTC), flexible numerology, and mmWave carriers. |
| 6G (~2030) | Can the network understand what it is carrying? | AI as a native component, reconfigurable propagation, and semantics as a design variable. |

Each row solved the previous row's bottleneck and created a new one. 4G's OFDM gave enormous
spectral efficiency and made latency the binding constraint. 5G attacked latency with short slots and
moved to mmWave for bandwidth — and discovered that at 28 GHz a human body is an obstacle worth
25 dB. That discovery is where this lab starts.`,
      },
      {
        id: 'why-6g',
        title: 'Why the 5G answers run out',
        level: 'beginner',
        body: `5G's answer to "we need more capacity" was more bandwidth at a higher carrier frequency. The
arithmetic of that answer is unforgiving, and you can run it yourself in the link budget experiment.

Free-space path loss is

$$\\text{FSPL} = 20\\log_{10}\\left(\\frac{4\\pi d}{\\lambda}\\right)$$

Because $\\lambda = c/f$, **moving from 3.5 GHz to 28 GHz costs 18 dB over the same distance** — the
received power drops by a factor of 63 — before any obstruction is considered. Move to 140 GHz and
it costs 32 dB. The bandwidth is there; the link budget to use it is not.

There are only three ways to pay that bill: transmit more power (limited by regulation and by
batteries), put the antennas closer together (limited by the cost of sites), or **change the channel
itself**. The third option is the one that did not previously exist, and it is what Module 3 is about.`,
        experiment: 'link-budget',
      },
      {
        id: 'requirements',
        title: 'The 6G requirement set, and which parts are load-bearing',
        level: 'intermediate',
        body: `ITU-R's IMT-2030 framework names six usage scenarios and a set of capability targets. The targets
that get quoted — 1 Tbit/s peak, 0.1 ms latency, 10⁷ devices/km² — are ceiling figures for one
scenario each, not simultaneous requirements, and treating them as a specification is the most common
way to misread the document.

The figures that actually constrain a design are the *ratios*:

- **Spectral efficiency** ×1.5 to ×3 over IMT-2020. Since Shannon caps spectral efficiency at
  $\\log_2(1+\\text{SNR})$, a 3× improvement at fixed SNR is not available. It has to come from more
  spatial streams, better SNR, or from not sending the data in the first place — which is Module 4.
- **Energy efficiency** ×100. This is the target that rules out brute force: you cannot meet it by
  transmitting harder.
- **Reliability** up to 1−10⁻⁷. Note what this does to latency: reliability that high needs
  retransmissions, and retransmissions cost round trips. The latency budget in every experiment here
  breaks out the retransmission term for exactly that reason.

A useful exercise is to take any 6G claim and ask which of these it trades against. Almost every
technique in this lab buys one by spending another.`,
      },
      {
        id: 'standardisation',
        title: 'Where the standard actually is',
        level: 'advanced',
        body: `As of 2026, 3GPP Release 20 is the first release with 6G study items; the first 6G specifications are
expected in Release 21, with commercial deployment targeted around 2030. Nothing in this lab is a
standardised 6G feature, and several of the techniques modelled here may not survive
standardisation at all.

That is worth stating precisely because the research literature is much further ahead than the
standard. Reconfigurable intelligent surfaces have a large body of theory and several testbeds; they
have no 3GPP specification. Semantic communication has a growing literature and no agreed
performance metric, which is a more serious gap than it sounds — a field where different papers
optimise PSNR, classification accuracy, and human preference scores is a field whose results cannot
yet be compared.

The practical consequence for a researcher: when this lab reports that one scheme beats another,
that statement is conditional on the metric it used, and changing the metric is a legitimate way to
reverse it. The semantic experiments here report three metrics side by side for that reason.`,
      },
    ],
  },
  {
    id: 'ai-native',
    number: 2,
    title: 'AI-native wireless communication',
    subtitle: 'Machine learning, deep learning, reinforcement learning',
    promise:
      'Where learning genuinely beats a designed algorithm in a radio, and where it is an expensive way to reach the same answer.',
    sections: [
      {
        id: 'three-families',
        title: 'Three families, three different jobs',
        level: 'beginner',
        body: `"AI in the network" covers three quite different things, and confusing them is why the phrase often
means nothing.

**Machine learning** fits a function to data. In a radio this is used for prediction and
classification: which beam will be best in 20 ms, is this traffic pattern an anomaly, which cell
should this user hand over to.

**Deep learning** fits a function with many layers, which matters when the input has structure worth
exploiting — images, spectrograms, channel matrices. The encoders in Module 5 are deep networks
because an image has spatial structure; a single-layer model would have to learn from scratch that
neighbouring pixels are related.

**Reinforcement learning** learns a *policy*: what to do, given what you observe, to maximise a
reward over time. It is the right tool when you have no labelled examples of the correct answer but
can measure how well an action worked. Configuring a reflecting surface is exactly that situation —
nobody can label the correct phase vector, but the resulting signal strength is measurable.

The lab uses all three, and each one appears where it belongs rather than everywhere.`,
      },
      {
        id: 'when-learning-wins',
        title: 'When learning beats a designed algorithm',
        level: 'intermediate',
        body: `A learned solution has to earn its place against an algorithm someone designed, and it does not
always win. The conditions under which it does are reasonably well understood:

1. **The model is unknown or intractable.** Designed algorithms need a model. Where the channel is
   hard to model — dense scattering, hardware non-linearity, mutual coupling between surface
   elements — a method that learns from measurements has an advantage that no amount of cleverness
   recovers.
2. **The problem is high-dimensional and non-convex.** Configuring 256 phases jointly is a
   combinatorial problem. Learned policies do not solve it exactly either, but they degrade
   gracefully where an exact method simply cannot run.
3. **The objective is not the one the theory optimises.** Classical coding minimises bit error rate.
   If what you care about is whether a receiver can still classify an image, minimising bit error
   rate is optimising a proxy, and the gap between proxy and objective is where end-to-end learning
   wins.

And where it loses: when a closed-form optimum exists and the model is known, a learned policy is a
slower, less reliable way to reach the same answer. The optimiser experiment puts that comparison on
one chart — the closed-form solution is on it, and it wins.`,
        experiment: 'ai-phase-optimisation',
      },
      {
        id: 'reinforcement',
        title: 'Reinforcement learning, concretely',
        level: 'intermediate',
        body: `The surface-configuration problem stated as a reinforcement learning problem:

- **Agent** — the surface controller.
- **Action** $a$ — a phase for each element, chosen from the values the hardware supports.
- **Reward** $r$ — the resulting SNR at the receiver, measured.
- **Policy** $\\pi_\\theta(a)$ — the controller's probability of choosing each action.

REINFORCE (Williams, 1992) updates the policy by the score-function gradient:

$$\\nabla_\\theta J = \\mathbb{E}\\left[(r - b)\\,\\nabla_\\theta \\log \\pi_\\theta(a)\\right]$$

The baseline $b$ is not optional. Without it the update is dominated by the average reward, and the
policy drifts toward whatever it sampled first rather than toward what was *better than typical*.
This lab subtracts the batch mean and divides by the batch standard deviation.

The choice of action space matters as much as the algorithm. A continuous Gaussian policy over 64
phases estimates a 64-dimensional gradient from a handful of scalar rewards and performs poorly; a
factored categorical policy over the discrete phases the hardware can set performs well with the same
budget. The implementation in this lab uses the second, and the comment in \`lib/optimizers.ts\`
records the measurement that caused the change.`,
        experiment: 'ai-phase-optimisation',
      },
      {
        id: 'training-honestly',
        title: 'What a model card has to say',
        level: 'advanced',
        body: `A trained model in a communication system is a claim, and a claim needs provenance. The three models
in this lab ship with cards recording:

- the generator that produced the training data, and its seed;
- the number of training and held-out samples, and confirmation they are disjoint;
- the optimiser, schedule, epochs and loss;
- the SNR distribution the model was trained across — a model trained at one SNR fails at others,
  and quoting its performance without that distribution is meaningless;
- measured performance on the held-out set at every SNR and every rate;
- the cost of the int8 quantisation used to ship the weights, measured rather than assumed;
- what the model cannot do.

The last item is the one most often missing. These models were trained on procedurally generated
16×16 scenes. They will not work on photographs, and the card says so. A result from this lab is a
result about this source, and carrying it further is the reader's responsibility — which they can
only discharge if the card told them where the boundary was.`,
      },
    ],
  },
  {
    id: 'irs',
    number: 3,
    title: 'Intelligent reflecting surfaces',
    subtitle: 'Reflection control, beamforming, channel optimisation',
    promise:
      'Why a passive sheet of tuneable elements can rescue a blocked link, and the arithmetic that says when it cannot.',
    sections: [
      {
        id: 'what-it-is',
        title: 'A surface with N knobs',
        level: 'beginner',
        body: `An intelligent reflecting surface — also called a reconfigurable intelligent surface — is a flat panel
covered in many small elements. Each element reflects whatever radio wave hits it, and each can be
told **how much to delay the reflection**, by a fraction of a wavelength.

It has no amplifier, no receiver and no transmitter. It cannot generate a signal, decode one, or add
energy to one. All it can do is change the phase of what bounces off it.

That sounds like very little. It is enough, because of interference. If the surface delays each
element's reflection by exactly the right amount, all the reflections arrive at the receiver *in
step* and add up. If the delays are wrong, they arrive out of step and partly cancel. The difference
between those two situations, for a 128-element surface, is more than 20 dB — a factor of over a
hundred in received power.

The name is doing some work: "intelligent" refers entirely to choosing those delays well.`,
        experiment: 'irs-coverage',
      },
      {
        id: 'the-equation',
        title: 'The signal model',
        level: 'intermediate',
        body: `With $N$ elements, let $h_{t,n}$ be the channel from the transmitter to element $n$, $h_{r,n}$ the
channel from element $n$ to the receiver, and $h_d$ the direct path. The surface applies
$\\Phi = \\mathrm{diag}(\\beta e^{j\\theta_1}, \\ldots, \\beta e^{j\\theta_N})$, and the received signal is

$$y = \\left(h_r^\\mathsf{T} \\Phi\\, h_t + h_d\\right)x + n$$

Expanded, the effective channel is

$$h_{\\text{eff}} = h_d + \\sum_{n=1}^{N} \\beta\\, e^{j\\theta_n} h_{r,n} h_{t,n}$$

Two facts follow immediately, and they are the whole subject:

**The optimum is available in closed form.** Received power is $|h_\\text{eff}|^2$, which is largest
when every term points the same way. So $\\theta_n = \\arg(h_d) - \\arg(h_{r,n}h_{t,n})$. No search is
needed — *if* you know every $h_{r,n}h_{t,n}$, which requires estimating $2N$ channel coefficients
through a device that cannot receive anything.

**The gain is quadratic in N.** Aligned, the $N$ terms add in amplitude, so power grows as $N^2$:
$20\\log_{10}(N)$ dB, or **6 dB per doubling**. With random phases they add incoherently and power
grows as $N$ — 3 dB per doubling. The element sweep in the coverage experiment plots both curves, and
the gap between them is what the controller is buying.`,
        experiment: 'irs-coverage',
      },
      {
        id: 'double-loss',
        title: 'Why a surface is not free gain',
        level: 'intermediate',
        body: `The $N^2$ law makes a surface sound unbeatable. It is not, because of what the signal pays to get
there and back.

A relay that receives and retransmits pays path loss twice, but the two losses **add in dB**. A
passive surface pays path loss twice too — and because it does not regenerate the signal, the two
losses **multiply**. For a transmitter–surface hop of $d_1$ and a surface–receiver hop of $d_2$, the
cascaded path loss goes as $(d_1 d_2)^2$, against $d^2$ for the direct path.

Over 60 m with the surface in the middle, that product is 900 m² against 3600 m² — but the constant
in front is much worse, and in practice the cascaded path starts tens of dB behind. The surface must
make that up entirely out of $20\\log_{10}(N)$.

This is why the interesting question is never "does the surface help" but **"how many elements does
it take"**, and why the answer depends on how badly the direct path is blocked. The coverage
experiment reports the crossover; on a clear line-of-sight link there often isn't one.`,
        experiment: 'irs-coverage',
      },
      {
        id: 'practical-limits',
        title: 'Discrete phases, lossy elements, and unknown channels',
        level: 'advanced',
        body: `Three practical constraints separate the theory from a deployable surface, and the lab models all
three.

**Discrete phase control.** Real elements are switched by PIN diodes with $2^b$ states. The array
gain loss from $b$-bit quantisation is

$$\\Delta = \\left(\\frac{2^b}{\\pi}\\sin\\frac{\\pi}{2^b}\\right)^2$$

which is 3.92 dB at 1 bit, 0.91 dB at 2 bits, and 0.22 dB at 3. Past 3 bits there is nothing left to
recover, which is why 2-bit surfaces are common. The lab measures this loss rather than quoting it,
and the test suite checks the measurement against the formula.

**Reflection loss.** $\\beta < 1$ in practice. Because power goes as $\\beta^2$, a surface with
$\\beta = 0.7$ gives up 3.1 dB before anything else happens.

**Channel estimation.** The closed-form solution needs $2N$ coefficients measured through a device
with no receiver. The standard approaches — switching elements on in groups, exploiting channel
sparsity at mmWave, or learning a policy that never estimates the channel at all — all cost either
time or optimality. The optimiser experiment charges the closed-form method one evaluation and says
plainly that it is not charged for the estimation, because that omission is the whole practical
difficulty.`,
        experiment: 'ai-phase-optimisation',
      },
    ],
  },
  {
    id: 'semantic',
    number: 4,
    title: 'Semantic communication',
    subtitle: 'Meaning-based transmission, encoding and reconstruction',
    promise:
      'What it means to transmit meaning rather than bits, and the honest accounting of what that buys.',
    sections: [
      {
        id: 'three-levels',
        title: "Shannon's three levels",
        level: 'beginner',
        body: `In the introduction to *A Mathematical Theory of Communication* (1948), Weaver set out three levels
of communication problem:

- **Level A, the technical problem.** How accurately can the symbols be transmitted?
- **Level B, the semantic problem.** How precisely do the transmitted symbols convey the intended
  meaning?
- **Level C, the effectiveness problem.** How effectively does the received meaning change conduct?

Seventy-five years of communication engineering solved Level A so thoroughly that the other two were
largely forgotten. Shannon's own framing was explicit: "the semantic aspects of communication are
irrelevant to the engineering problem."

Semantic communication is the argument that this is no longer true. When the receiver is a machine
that will act on the content, the question stops being "did every bit arrive" and becomes "did enough
of the meaning arrive to act correctly". Those are different questions with different optimal
answers.`,
      },
      {
        id: 'what-changes',
        title: 'What actually changes in the system',
        level: 'intermediate',
        body: `Three things change, and only the third is genuinely hard.

**The objective changes.** Instead of minimising bit error rate, the system minimises a distortion
defined on the meaning — reconstruction quality, task accuracy, or a weighted combination.

**The encoder changes.** A source coder removes redundancy the *source* does not need. A semantic
encoder removes what the *receiver* does not need, which is more aggressive and depends on knowing
something about the task.

**The failure mode changes**, and this is the difficult part. A bit-level system degrades pixel by
pixel. A semantic system that loses its description does not produce a slightly worse scene — it
produces the wrong scene, confidently. The classical scheme's cliff and the semantic scheme's
confident error are different pathologies, and neither is obviously preferable. The semantic
experiment reports the classical block-loss rate next to the neural reconstruction quality so both
are visible at once.`,
        experiment: 'semantic-transmission',
      },
      {
        id: 'importance',
        title: 'Semantic importance and unequal protection',
        level: 'intermediate',
        body: `If some of the content matters more, the system should spend more of its resources on it. That is
the practical content of "semantic importance", and there are two places to apply it.

**In the metric.** Ordinary PSNR treats a corrupted background pixel exactly like a corrupted pixel
of the object. For a receiver whose job is to act on what the scene contains, it should not. This lab
computes a task-weighted PSNR alongside the ordinary one, weighting the object up to ten times the
background — and it can do so honestly only because the scenes are generated, so the ground-truth
object mask is known. A real dataset would need hand-drawn masks first.

**In the transmission.** The classical path here allocates more quantisation bits to the
low-frequency coefficients that carry structure when importance is raised. This is unequal error
protection, and it is the classical answer to the same question.

Both are reported, and they do not always agree. A configuration that improves task-weighted score
while lowering plain PSNR has made a real trade, not an improvement, and the lab shows both numbers
so that trade stays visible.`,
        experiment: 'semantic-transmission',
      },
      {
        id: 'open-problems',
        title: 'What the field has not settled',
        level: 'advanced',
        body: `Three unsolved problems, stated plainly, because a lab that presents semantic communication as a
finished technique is misinforming its learners.

**There is no agreed metric.** Papers optimise PSNR, SSIM, LPIPS, classification accuracy, or human
preference. These rank systems differently. Until the field agrees, cross-paper comparison is not
possible, and "our semantic system outperforms the baseline" is a claim about a metric choice as much
as about a system.

**Knowledge-base synchronisation is unsolved.** Semantic compression works because the transmitter and
receiver share background knowledge. If they drift apart — different model versions, different
training data — the receiver reconstructs something the transmitter did not send, and there is no
mechanism in the theory to detect this. It is not a bit error, so no checksum catches it.

**Confident wrongness has no defence yet.** A neural decoder reconstructs a plausible scene from
whatever it receives. There is no equivalent of a CRC: nothing in the received signal says "this
reconstruction is not what was sent". For a system that will act on the result, that is a safety
property, not a performance one, and it is the reason semantic communication is not yet deployed
anywhere it matters.`,
      },
    ],
  },
  {
    id: 'deepjscc',
    number: 5,
    title: 'Deep joint source-channel coding',
    subtitle: 'Neural encoder, channel transmission, neural decoder',
    promise:
      'One network from source to channel symbols, why the separation theorem does not forbid it, and what it costs.',
    sections: [
      {
        id: 'separation',
        title: 'The separation theorem, and its fine print',
        level: 'beginner',
        body: `Shannon's separation theorem is why every communication system you have used is built in two
independent halves. It says that compressing the source (JPEG, MP3) and protecting it against the
channel (LDPC, Turbo codes) can be designed **separately** with no loss of optimality.

This is an enormously useful result. It means a JPEG encoder need know nothing about radio, and an
LDPC decoder need know nothing about images. The entire modular architecture of modern communications
rests on it.

The fine print is that it holds **in the limit of infinite block length and unlimited delay**. For
long files over a stable channel, that limit is close enough. For a 16×16 sensor image over a fading
link with a millisecond deadline, it is not close at all — and in that regime, designing the two
halves together can do better.`,
      },
      {
        id: 'architecture',
        title: 'The architecture',
        level: 'intermediate',
        body: `DeepJSCC (Bourtsoulatze, Burth Kurka & Gündüz, 2019) replaces both halves with one pair of networks:

\`\`\`
source  →  neural encoder  →  power constraint  →  CHANNEL  →  neural decoder  →  reconstruction
\`\`\`

The encoder maps the source directly to $k$ complex channel symbols. There are no bits anywhere in
the chain — the channel input is continuous-valued, which is legal and which a separation-based system
gives up by quantising first.

Two details make it work:

**The power constraint is part of the network.** The latent is normalised so that its average energy
per channel use is fixed. Without this the encoder "beats" the noise by scaling up, which is not a
coding gain and does not survive a real power amplifier.

**The channel is differentiable.** Adding Gaussian noise passes the gradient straight through, so the
encoder is trained *through* the channel and learns a representation whose important information
survives it. This is the entire difference from an autoencoder with a noisy bottleneck bolted on
afterwards.

The bandwidth ratio $\\rho = k/n$ — channel uses per source symbol — is the system's compression
setting. The models in this lab run at $\\rho = 1/8$ down to $1/32$.`,
        experiment: 'semantic-transmission',
      },
      {
        id: 'graceful',
        title: 'Graceful degradation and the cliff',
        level: 'intermediate',
        body: `The headline property of DeepJSCC is what happens when the channel is worse than expected.

A separation-based system has a **threshold**. Above it, the channel code corrects every error and
the reconstruction is exactly the compressed version — excellent. Below it, the decoder fails and the
receiver has *nothing*. The transition takes about a decibel. This is the cliff effect, and it is not
a flaw in anyone's implementation; it is what a block code does when it runs out of correction
capability.

DeepJSCC has no threshold. As the SNR drops, the reconstruction gets gradually blurrier. There is no
point at which it stops working.

Which matters depends on whether you know the channel in advance. If you do, separation is efficient
and you can operate just above the threshold. If you do not — a mobile receiver, a fading link, a
broadcast to receivers at different distances — the cliff is a liability and graceful degradation is
worth real bandwidth.

The architecture comparison experiment sweeps SNR for three trained models and the classical baseline
on the same scenes and the same noise. The cliff is visible in the classical curve; the neural curves
do not have one.`,
        experiment: 'architecture-comparison',
      },
      {
        id: 'architectures',
        title: 'Choosing the encoder family',
        level: 'advanced',
        body: `The DeepJSCC idea is independent of what the encoder is made of. This lab trains three encoder
families to the same bandwidth ratio, on the same data, with the same optimiser and schedule, so the
comparison isolates the architecture:

- **Dense (fully connected).** Every pixel connects to every hidden unit. The most general mapping,
  and the one that knows the least — nothing in it encodes that neighbouring pixels are related.
- **Convolutional.** Strided convolutions to a small spatial latent, resize-convolutions back. Weight
  sharing builds in translation structure, which is why it does more with fewer parameters.
- **Self-attention (Transformer).** The scene is split into patches; attention lets every patch
  condition on every other before the channel. More parameters, and more data needed to train them.

Their measured performance is in the model cards, and the ranking there is a result about *this*
source at *this* parameter budget. A different budget can reorder them, which the cards also say. The
useful skill is not memorising which won but being able to read a comparison and see what it was
conditional on.`,
        experiment: 'architecture-comparison',
      },
    ],
  },
];

export const moduleById = (id: string): KnowledgeModule | undefined =>
  KNOWLEDGE_MODULES.find((m) => m.id === id);

export const sectionsForLevel = (
  module: KnowledgeModule,
  level: LearningLevel,
): KnowledgeSection[] => {
  const order: LearningLevel[] = ['beginner', 'intermediate', 'advanced'];
  const ceiling = order.indexOf(level);
  return module.sections.filter((section) => order.indexOf(section.level) <= ceiling);
};
