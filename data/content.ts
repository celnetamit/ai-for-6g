
import { AppContent } from '../types';

export const content: AppContent = {
  workshopTitle: "AI for 6G: Intelligent Communication Networks, Semantic Connectivity & Autonomous Wireless Systems Lab",
  lastReviewed: "2024-07-28T10:00:00Z",
  learningMaterials: [
    {
      id: "module-1",
      title: "Course unit 1: Intelligent Reflecting Surfaces (IRS)",
      description: "Modeling the channel with an IRS and using deep reinforcement learning to configure the phase shifts of the IRS elements to maximize SNR at the receiver.",
      lessons: [
        {
          id: "intro-to-irs",
          title: "Introduction to Intelligent Reflecting Surfaces",
          content: `
# Introduction to Intelligent Reflecting Surfaces (IRS)

An Intelligent Reflecting Surface (IRS), also known as a reconfigurable intelligent surface (RIS), is a key enabling technology for future 6G wireless networks. It is a planar surface composed of a large number of passive, low-cost reflecting elements. Each element can independently induce a controllable phase shift on the incident electromagnetic wave.

## Why do we need IRS?

In traditional wireless systems, the communication channel is a random and often unfavorable factor that we must combat. Fading, blockages, and multi-path propagation can severely degrade signal quality. IRS technology fundamentally changes this paradigm.

By intelligently coordinating the phase shifts of all elements, an IRS can collaboratively shape the wireless channel to:
- **Enhance Signal Strength:** Focus the reflected signal towards the intended receiver, creating a virtual line-of-sight path and boosting the received signal-to-noise ratio (SNR).
- **Mitigate Interference:** Nullify interfering signals by reflecting them in destructive directions.
- **Expand Coverage:** Overcome dead zones by reflecting signals around obstacles.

## How does it work?

An IRS itself does not transmit or receive signals; it only reflects them passively. This makes it extremely energy-efficient. The 'intelligence' comes from a smart controller, which dynamically adjusts the phase shifts of the IRS elements based on the channel state information (CSI) and communication requirements.

> **See it working:** the *Rescuing a blocked link with an IRS* experiment draws
> the element sweep for a surface you configure, and the Tools page has a 3D view
> of an IRS-assisted link whose per-element phases you can inspect.

The core challenge lies in finding the optimal phase shifts for hundreds or thousands of elements in real-time. This is a high-dimensional optimization problem where traditional methods fall short. This is where AI, specifically **Deep Reinforcement Learning (DRL)**, comes into play. A DRL agent can learn an optimal policy to configure the IRS phase shifts to maximize a long-term reward, such as the achievable data rate or SNR.
`
        },
        {
          id: "drl-for-irs",
          title: "Deep Reinforcement Learning for IRS Beamforming",
          content: `
# Deep Reinforcement Learning (DRL) for IRS Beamforming

Optimizing the phase shifts of an IRS is a complex task. The number of possible configurations grows exponentially with the number of elements. Deep Reinforcement Learning (DRL) provides a powerful framework to solve this problem without needing a perfect mathematical model of the environment.

## The DRL Framework

We can model the IRS optimization problem as a Markov Decision Process (MDP):

- **Agent:** The IRS controller.
- **Environment:** The wireless channel, including the transmitter, receiver, and scatterers.
- **State (s):** The channel state information (CSI) from the transmitter to the IRS and from the IRS to the receiver.
- **Action (a):** The set of phase shifts applied to the IRS elements.
- **Reward (r):** A metric we want to maximize, typically the received Signal-to-Noise Ratio (SNR) or the data rate.

The DRL agent interacts with the environment. At each time step, it observes the current state (CSI), takes an action (sets phase shifts), and receives a reward (the resulting SNR). The goal of the agent is to learn a **policy (π)** that maps states to actions in a way that maximizes the cumulative future reward.

## Popular DRL Algorithms

Several DRL algorithms are suitable for this task:

1.  **Deep Q-Network (DQN):** Excellent for discrete action spaces. We can discretize the continuous phase shifts into a finite set of values.
2.  **Deep Deterministic Policy Gradient (DDPG):** Suitable for continuous action spaces, which is more natural for phase shift control.
3.  **Proximal Policy Optimization (PPO):** A state-of-the-art algorithm known for its stability and sample efficiency.

## Simulation Example

In our interactive tool, you will simulate a simplified version of this system. You will see how a DRL agent learns to adjust the IRS phase shifts to improve the SNR over time, outperforming random or fixed configurations.
`
        }
      ]
    },
    {
      id: "module-2",
      title: "Course unit 2: Semantic Communication Systems",
      description: "Moving beyond bit-level transmission. Designing an autoencoder architecture where the transmitter extracts semantic features and the receiver reconstructs the meaning.",
      lessons: [
        {
          id: "intro-to-semantic-comm",
          title: "Beyond Bits: Introduction to Semantic Communication",
          content: `
# Beyond Bits: Introduction to Semantic Communication

For over 70 years, communication theory, based on Shannon's groundbreaking work, has focused on one goal: reliably transmitting bits from a source to a destination. This is known as **technical communication**. The meaning, or **semantics**, of those bits has been considered irrelevant to the communication channel.

However, with the rise of AI and machine-to-machine communication, this paradigm is shifting. The ultimate goal of communication is often not to reconstruct the exact source data, but to enable the receiver to perform a specific task or understand the intended meaning.

**Semantic communication** is a new paradigm that aims to transmit the meaning of the data, rather than the raw data itself.

## Key Idea

The core idea is to leverage the knowledge shared between the transmitter and receiver. For example, if we want to transmit an image of a 'cat', a traditional system would encode all the pixels. A semantic system would extract the key features that define a 'cat' (e.g., pointy ears, whiskers, feline shape) and transmit only this compact representation. The receiver, having prior knowledge of what cats look like, can then reconstruct a plausible image of a cat.

> **See it working:** the *Semantic versus bit-level transmission* experiment
> sends one scene both ways over the same channel and measures what each
> receiver reconstructed.

## Advantages

- **Extreme Compression:** By transmitting only the essential semantic information, we can achieve massive data compression, far beyond what traditional source coding can offer.
- **Robustness to Noise:** Since the transmitted information is at a higher level of abstraction, it can be more resilient to channel errors. A few corrupted bits might slightly alter a feature, but the overall meaning ('cat') might still be preserved.
- **Task-Oriented:** We can optimize the communication system directly for the end-task, such as object detection or classification, rather than for bit-level fidelity (e.g., low Bit Error Rate).
`
        },
        {
          id: "autoencoders-for-semantics",
          title: "Autoencoders for Semantic Feature Extraction",
          content: `
# Autoencoders for Semantic Feature Extraction

A key building block for semantic communication is the **autoencoder**. An autoencoder is a type of artificial neural network used to learn efficient data codings in an unsupervised manner. The aim of an autoencoder is to learn a representation (encoding) for a set of data, typically for dimensionality reduction, by training the network to ignore signal 'noise'.

## Architecture

An autoencoder consists of two main parts:
1.  **Encoder:** This part of the network compresses the input data into a lower-dimensional latent space representation. This compressed representation contains the most important, or 'semantic', features of the input.
2.  **Decoder:** This part of the network reconstructs the input data from the latent space representation.

The network is trained by minimizing the **reconstruction error**—the difference between the original input and the reconstructed output. By forcing the data to pass through the lower-dimensional 'bottleneck' of the latent space, the network must learn to capture the most salient features.

> **See it working:** the AI model engine shows the encoder, the channel and the
> decoder for each trained architecture, and lets you push one scene through at
> an SNR of your choosing.

## Application in Semantic Communication

In a semantic communication system, the **encoder** acts as the **semantic transmitter**. It takes a high-dimensional input (like an image) and outputs a compact semantic representation. This representation is what gets transmitted over the channel.

The **decoder** acts as the **semantic receiver**. It takes the received semantic information and reconstructs the original data, or a plausible version of it.

You can experiment with a simplified version of this in our **Autoencoder Visualizer** tool.
`
        }
      ]
    },
    {
        id: "module-3",
        title: "Course unit 3: Joint Source-Channel Coding with AI",
        description: "Designing an end-to-end neural network that replaces traditional separate source and channel coding, optimizing for a specific task fidelity under channel constraints.",
        lessons: [
            {
                id: "intro-to-jscc",
                title: "Introduction to Joint Source-Channel Coding (JSCC)",
                content: `
# Introduction to Joint Source-Channel Coding (JSCC)

Shannon's separation theorem, a cornerstone of classical information theory, states that source coding (compression) and channel coding (error correction) can be optimized independently without any loss of optimality. This principle has guided the design of communication systems for decades, leading to the modular design of separate compression algorithms (like JPEG, MP3) and error-correcting codes (like Turbo codes, LDPC).

However, the separation theorem holds true only in the limit of infinitely long data blocks and latency, which is impractical for many modern applications. For short, real-time transmissions, treating source and channel coding jointly can lead to significant performance gains.

**Joint Source-Channel Coding (JSCC)** is an approach where compression and error protection are designed together in a single, unified step.

## AI-Powered JSCC

Deep learning provides a powerful way to implement JSCC. An end-to-end neural network can be trained to learn a transformation from the source data directly to a channel-robust representation.

- The **transmitter (encoder)** is a neural network that maps the source (e.g., an image or text) to a set of continuous-valued symbols ready for transmission.
- The **channel** adds noise to these symbols.
- The **receiver (decoder)** is another neural network that takes the noisy symbols and attempts to reconstruct the original data or, more importantly, the original *meaning*.

This end-to-end system can be trained to be robust against the specific noise characteristics of the channel, often outperforming traditional separation-based systems, especially in low signal-to-noise ratio (SNR) regimes. This approach demonstrates a graceful degradation of quality, whereas traditional systems often exhibit a sharp 'cliff effect' where the signal becomes unusable below a certain quality threshold.

You can see this in action in our **JSCC Simulator** tool.
`
            }
        ]
    }
  ],
  assessments: {
    "module-1": [
      {
        question: "What is the primary function of an Intelligent Reflecting Surface (IRS)?",
        options: ["Transmit its own data signal", "Passively reflect and shift the phase of incident signals", "Amplify the incoming signal", "Act as a base station"],
        correctAnswer: "Passively reflect and shift the phase of incident signals"
      },
      {
        question: "Why is Deep Reinforcement Learning (DRL) a suitable technique for controlling an IRS?",
        options: ["Because the wireless channel is static and predictable", "It can handle the high-dimensional optimization problem of phase shifts without a perfect channel model", "It requires very little data to train", "It is the only AI technique available"],
        correctAnswer: "It can handle the high-dimensional optimization problem of phase shifts without a perfect channel model"
      }
    ],
    "module-2": [
      {
        question: "What is the main goal of semantic communication?",
        options: ["To achieve the lowest possible Bit Error Rate (BER)", "To transmit the meaning of the data, not just the raw bits", "To encrypt the data as securely as possible", "To use the least amount of power"],
        correctAnswer: "To transmit the meaning of the data, not just the raw bits"
      },
      {
        question: "What role does an autoencoder's 'encoder' play in a semantic communication system?",
        options: ["It reconstructs the image at the receiver.", "It adds error-correction bits.", "It acts as the semantic transmitter, extracting key features into a compact representation.", "It encrypts the data."],
        correctAnswer: "It acts as the semantic transmitter, extracting key features into a compact representation."
      }
    ],
    "module-3": [
        {
            question: "What is the key idea behind Joint Source-Channel Coding (JSCC)?",
            options: ["Source coding and channel coding should always be designed separately.", "Combining source coding (compression) and channel coding (error protection) into a single, optimized step.", "Using stronger encryption for the source.", "It is another name for semantic communication."],
            correctAnswer: "Combining source coding (compression) and channel coding (error protection) into a single, optimized step."
        }
    ]
  },
  knowledgeBank: {
    glossary: [
      { term: "IRS (Intelligent Reflecting Surface)", definition: "A planar surface with many passive elements that reflect signals with controllable phase shifts to enhance wireless communication.", category: "Wireless Technologies" },
      { term: "DRL (Deep Reinforcement Learning)", definition: "A type of machine learning where an agent learns to make decisions by taking actions in an environment to maximize a cumulative reward.", category: "AI Methods" },
      { term: "Semantic Communication", definition: "A communication paradigm focused on transmitting the meaning or semantic content of data, rather than the raw data itself.", category: "Core Concepts" },
      { term: "Autoencoder", definition: "A type of neural network used for unsupervised learning, typically for dimensionality reduction or feature learning. It consists of an encoder and a decoder.", category: "AI Methods" },
      { term: "SNR (Signal-to-Noise Ratio)", definition: "A measure used in science and engineering that compares the level of a desired signal to the level of background noise. It is often expressed in decibels (dB).", category: "Core Concepts" },
      { term: "Beamforming", definition: "A signal processing technique used to control the directionality of the transmission or reception of radio signals. In IRS, it's achieved by adjusting phase shifts.", category: "Wireless Technologies" },
      { term: "JSCC (Joint Source-Channel Coding)", definition: "An approach where source coding (compression) and channel coding (error correction) are designed together in a single step, often using end-to-end deep learning.", category: "Core Concepts" },
      { term: "Latent Space", definition: "In an autoencoder, the lower-dimensional space that contains the compressed representation of the input data. This space captures the most salient, semantic features.", category: "AI Methods" },
      { term: "Rician K-factor", definition: "The ratio of power in the direct, specular path to power in the scattered paths, in dB. A high K means mild fading; K = 0 (a vanishing specular term) is Rayleigh fading, where deep fades are common.", category: "Core Concepts" },
      { term: "Rayleigh fading", definition: "The amplitude distribution of a channel made entirely of scattered paths, with no line of sight. It is the case an IRS exists to rescue, because its deep fades dominate the average error rate.", category: "Core Concepts" },
      { term: "Path loss", definition: "The drop in signal power with distance. Free-space loss is 20·log10(4\u03c0d/\u03bb), which carries a frequency term \u2014 moving from 3.5 GHz to 28 GHz costs 18 dB over the same distance.", category: "Core Concepts" },
      { term: "EVM (Error Vector Magnitude)", definition: "The RMS distance between the received symbols and the ideal constellation points, relative to the reference amplitude. The signal-quality figure a spectrum analyser displays.", category: "Core Concepts" },
      { term: "BLER (Block Error Rate)", definition: "The fraction of transport blocks containing at least one bit error. It drives retransmissions, and therefore latency, far more directly than the raw bit error rate does.", category: "Core Concepts" },
      { term: "HARQ", definition: "Hybrid automatic repeat request: the retransmission scheme that turns block errors into delay rather than loss. A packet allowed K attempts at block error rate p needs (1\u2212p^K)/(1\u2212p) transmissions on average.", category: "Wireless Technologies" },
      { term: "MCS (Modulation and Coding Scheme)", definition: "The pairing of a constellation with a code rate. Link adaptation selects the highest scheme the current SNR sustains \u2014 which is why a link that loses 6 dB does not get noisier, it gets slower.", category: "Wireless Technologies" },
      { term: "Goodput", definition: "The rate an application actually receives, after physical-layer overhead and after blocks lost to errors. Always below the raw rate, and well below the Shannon bound.", category: "Core Concepts" },
      { term: "Energy efficiency", definition: "Bits delivered per joule consumed. The total includes the amplifier (transmit power divided by its efficiency), the baseband circuitry, and the per-element control power of any reflecting surface.", category: "Core Concepts" },
      { term: "Bandwidth ratio (\u03c1)", definition: "Channel uses per source symbol in a joint source-channel code. The compression setting of a DeepJSCC system: \u03c1 = 1/8 means one complex symbol transmitted for every eight source pixels.", category: "AI Methods" },
      { term: "Cliff effect", definition: "The behaviour of a separation-based system at its threshold: excellent above it, nothing at all below it, with about a decibel in between. It is what a block code does when it runs out of correction capability, not a flaw in an implementation.", category: "Core Concepts" },
      { term: "Graceful degradation", definition: "Reconstruction quality that falls smoothly as the channel worsens, with no threshold. The headline property of DeepJSCC, and the reason it is worth bandwidth when the channel is not known in advance.", category: "AI Methods" },
      { term: "REINFORCE", definition: "A policy-gradient reinforcement learning algorithm (Williams, 1992) that updates a policy using the score-function gradient weighted by reward. The baseline subtraction is not optional \u2014 without it the policy chases the average reward rather than what beat it.", category: "AI Methods" },
      { term: "Cross-entropy method", definition: "Derivative-free policy search: sample a population, keep the best fraction, refit the sampling distribution to them, repeat. Robust where a gradient estimate is too noisy to follow.", category: "AI Methods" },
      { term: "Phase quantisation loss", definition: "The array gain given up because a surface can only set 2^b phases. (2^b/\u03c0 \u00b7 sin(\u03c0/2^b))\u00b2 \u2014 3.9 dB at one bit, 0.9 dB at two, 0.2 dB at three.", category: "Wireless Technologies" },
      { term: "Jain fairness index", definition: "(\u03a3x)\u00b2/(n\u00b7\u03a3x\u00b2) over the per-user rates. 1 when every user gets the same rate, 1/n when one user gets everything. Reported next to sum rate because the two disagree.", category: "Core Concepts" },
      { term: "Semantic importance", definition: "A weighting that says which part of the content matters. Applied here both to the score (the object weighted above the background) and to the transmission (bits shifted onto the coefficients that carry structure).", category: "Core Concepts" },
      { term: "Model card", definition: "The record that makes a trained model's numbers meaningful: its training data and seeds, its optimiser and schedule, its measured performance on held-out data, and what it cannot do.", category: "AI Methods" }
    ],
    faqs: [
      {
        question: "Is this application suitable for beginners?",
        answer: "This application is designed for learners with prerequisites in Wireless Communications, Information Theory, and Deep Learning. While some concepts are introduced, a foundational understanding is recommended."
      },
      {
        question: "Do I need to install any software?",
        answer: "No, this is a fully self-contained web application. All the learning materials and interactive tools run directly in your browser."
      },
      {
        question: "How is my progress saved?",
        answer: "Progress, experiment history and saved projects are written to this browser's local storage. Nothing is uploaded, which also means nothing follows you to another device and clearing site data deletes it. Download a report for anything you need to keep."
      },
      {
        question: "Are these results real measurements?",
        answer: "No. Every figure in this lab is produced by its own simulation engine from the parameters you set, using educational models \u2014 free-space path loss, Rician block fading, Gray-coded QAM, the IRS cascade, and three DeepJSCC networks trained on procedurally generated scenes. Nothing here has been validated against a physical network, and every results screen says so."
      },
      {
        question: "Where do the AI models come from?",
        answer: "They were trained offline by scripts/train-models.ts on data this repository generates, and they ship as quantised weights with model cards recording the seeds, the schedule, the held-out performance and the limitations. The browser only runs inference. A test re-runs each card's evaluation against the shipped weights, so a card that disagrees with its model fails the build."
      },
      {
        question: "What is the 6G Network Copilot allowed to do?",
        answer: "It explains results the engine has already computed. It is never asked to calculate anything, and every figure in a reply that does not appear in the supplied results is flagged for you to check. Where no language-model gateway is configured, the assistant is absent and the panel shows the engine's own reading of the numbers instead \u2014 it is not simulated."
      },
      {
        question: "Can I reproduce a result?",
        answer: "Yes, exactly. Every run is determined by its configuration and its random seed, both of which appear in the report and in the history entry. Re-entering them reproduces every number."
      }
    ]
  },
  aboutPageContent: {
    analysisSummary: "A virtual research environment for next-generation communication systems. The lab is built around one principle: nothing is asserted that could be measured. Bit error rates are counted over generated noise rather than read from a curve, the gain of a reflecting surface is the magnitude of a complex sum rather than a fitted line, and the three neural models were genuinely trained offline and ship with the held-out measurements that justify them. Everything the models cannot do is stated on the screen that shows their output.",
    mission: "To let a learner disagree with a result and then check it. Every experiment is reproducible from its configuration and seed, every equation on screen is implemented in code the learner can read, and every claim the lab makes about its own accuracy is backed by a test that compares a measurement against a closed-form reference. A simulator that cannot be argued with teaches trust rather than engineering.",
    keyFeatures: [
      {
        title: "A real simulation engine",
        description: "Free-space path loss with a frequency term, Rician block fading, Gray-coded QAM with maximum-likelihood detection, the IRS cascade y = (h_r\u1d40 \u03a6 h_t)x + n, Shannon capacity, HARQ latency and a published energy model. Unit-tested against closed-form references \u2014 the measured bit error rate is checked to agree with the textbook curve."
      },
      {
        title: "Neural models that were actually trained",
        description: "Three DeepJSCC architectures \u2014 convolutional, self-attention and fully connected \u2014 trained offline by a script in this repository on data it generates, and shipped as quantised weights with model cards. A test re-runs each card's evaluation against the shipped weights, so a card cannot drift away from the model it describes."
      },
      {
        title: "Reinforcement learning on a real objective",
        description: "REINFORCE and the cross-entropy method configure the surface using nothing but the measured reward, against random search and the closed-form optimum, under an identical evaluation budget. The convergence traces are real evaluations, recorded as they happen."
      },
      {
        title: "Stated limitations, everywhere",
        description: "Every run lists what its models leave out \u2014 Doppler, molecular absorption, channel estimation cost, the generosity of an idealised channel code. Every export carries a provenance header. The assistant is given computed results and is audited for figures it introduces."
      }
    ]
  },
  legal: {
    privacyPolicy: {
      title: "Privacy Policy",
      lastUpdated: "July 26, 2024",
      sections: [
        { title: "Introduction", content: "This Privacy Policy describes how your personal information is handled in the AI for 6G Learning Platform. As this is a demo application, we are committed to protecting your privacy. No personal data is collected, stored, or transmitted to any server." },
        { title: "Data Collection and Use", content: "We do not collect any personally identifiable information. All user-generated data, such as progress and experiment results, is stored exclusively on your local device using browser localStorage and is never transmitted to us or any third party." },
        { title: "Disclaimer", content: "This application is provided 'as is' for educational and demonstration purposes only. Nano Science and Technology Consortium (NSTC) and nanoschool.in bear no liability for any consequences arising from its use. By using this application, you agree to these terms." }
      ]
    },
    termsOfService: {
      title: "Terms of Service",
      lastUpdated: "July 26, 2024",
      sections: [
        { title: "Agreement to Terms", content: "By accessing or using our application, you agree to be bound by these Terms of Service. If you disagree with any part of the terms, then you may not access the application." },
        { title: "Use License", content: "Permission is granted to temporarily use the application for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title." },
        { title: "Limitation of Liability", content: "In no event shall Nano Science and Technology Consortium (NSTC) or its suppliers be liable for any damages arising out of the use or inability to use the materials on this application. The platform and its content are provided for educational purposes only and should not be used for any commercial or critical applications. The user assumes all risks." }
      ]
    }
  }
};