# GUI-Operating Agents That Learn From Users — Research Notes

*Scope: production architectures for an embedded agent in a Tauri/React desktop app that clicks/fills real UI components and learns from user behavior. Local-first. July 2026.*

---

## 1. JEPA: what it is, and whether it belongs here

**What it actually is.** JEPA (Joint Embedding Predictive Architecture) is LeCun's 2022 proposal for self-supervised world models: instead of reconstructing pixels (autoencoders) or predicting tokens (LLMs), an encoder maps input to a latent embedding and a predictor predicts the *embedding* of a masked/future part of the input. Predicting in representation space lets the model discard unpredictable detail and keep only structure ([LeCun position paper via Turing Post](https://www.turingpost.com/p/jepa), [Bandaru deep dive](https://rohitbandaru.github.io/blog/JEPA-Deep-Dive/)). Concrete instances: I-JEPA (images, 2023), V-JEPA/V-JEPA 2 (video). V-JEPA 2 is the strongest evidence it works as a *world model*: a 1B+-param video model pre-trained on ~1M hours of video, post-trained with ~62h of robot data into an action-conditioned variant (V-JEPA 2-AC) that does zero-shot pick-and-place via model-predictive control in latent space ([V-JEPA 2 paper](https://arxiv.org/pdf/2506.09985)).

**Is it practical for learning UI interaction from user demos in a desktop app? No.** Three reasons:

1. **Scale mismatch.** JEPA's wins come from web-scale pretraining plus GPU-heavy planning-time optimization (CEM/MPC rollouts in latent space). A desktop app collects thousands of interaction events per user, not millions of hours; there is no published JEPA result learning useful policies from data at that scale, and no production GUI agent uses one.
2. **You already own the world model.** JEPA exists to *infer* latent state from raw sensory input (pixels). In your own app the true state is available programmatically — React component tree, Redux/Zustand stores, route, accessibility tree. Learning a lossy latent approximation of state you can read exactly is strictly worse.
3. **The hard part isn't prediction, it's intent.** "What will the UI look like after clicking Save" is deterministic in-app. The open problem is mapping fuzzy user intent to action sequences — a retrieval/planning problem, not a perception problem.

**Lightweight alternative that achieves the actual goal** (predict next UI state / action affordances): a **symbolic state graph + statistical next-action model**. Nodes = (route, anchor-set, key state flags); edges = recorded actions with observed post-state. Affordance prediction = "which anchors are visible and enabled in this state" (read directly from the registry). Next-action prediction = n-gram / Markov statistics over recorded traces, optionally re-ranked by a small embedding model. This gives you everything a JEPA world model would promise — next-state prediction, affordances, planning via graph search — at ~zero training cost, fully local, and inspectable. If you ever want learned generalization, a fine-tuned small transformer over *event tokens* (anchor IDs, not pixels) is the credible next step — still not JEPA.

**Honest summary:** JEPA is real research with real robotics results, but citing it for an in-app UI agent is hype. It solves perception-from-pixels; you don't have a pixel problem.

---

## 2. What production GUI agents actually do today

Two action-space families ([GUI Agents survey, ACL 2025](https://aclanthology.org/2025.findings-acl.1158.pdf)):

- **Pixel-based**: model sees screenshots, emits (x, y) clicks and keystrokes. **Claude computer use** works this way — screenshot in, coordinate actions out; portable across any OS but sensitive to resolution/scaling mismatches and slow (screenshot round-trip per step) ([Anthropic docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)). **OpenAI Operator/CUA** is similar inside a hosted browser. Reliability is the tell: OSWorld scores in the 22–40% range, degrading sharply with step count ([WorkOS comparison](https://workos.com/blog/anthropics-computer-use-versus-openais-computer-using-agent-cua)). These exist for the *third-party software* problem — automating apps you don't control.
- **Structure-based (DOM / accessibility tree)**: model sees a compact semantic tree and emits actions against element IDs. **browser-use** extracts interactive elements into an indexed `selector_map` (buttons, inputs, ARIA roles, click handlers) — the a11y tree is typically 5–10% the size of the raw DOM, and the LLM clicks "element 14", never a coordinate ([browser-use internals](https://deepwiki.com/browser-use/browser-use/5.3-interactive-element-detection)). Playwright MCP does the same with accessibility snapshots. Structure-based agents are consistently faster, cheaper, and more reliable when the structure is available; production browser agents now default to structure + screenshots only as a fallback for canvas content ([Building Browser Agents](https://arxiv.org/pdf/2511.19477)).

**Why semantic registries + deterministic flows beat pixel models for an in-app agent.** Pixel agents pay a triple tax you don't owe: grounding error (the model must *find* the button), latency (vision inference per step), and compounding failure (0.95^20 ≈ 0.36 success over 20 steps). When you own the app, you can expose a curated action API: every actionable component registers itself with a stable ID and semantic description, and the agent invokes actions by ID — 100% grounding accuracy, no vision model, offline-capable, testable like any API. The LLM's job shrinks to planning over a small vocabulary, which small local models can do. This is also the emerging consensus: hybrid GUI+API action spaces outperform pure GUI action spaces wherever an API exists ([Hybrid GUI+API action space](https://www.emergentmind.com/topics/hybrid-gui-api-action-space)).

---

## 3. Behavior learning that IS practical at app scale

- **Action-trace recording.** Instrument the anchor registry so every user click/fill/navigation is an event `(timestamp, anchor_id, action, params_hash, route, session)`. This is exactly what commercial **task mining** products (UiPath, Skan, SAP Signavio) do — record desktop UI events, then mine them ([Skan task-mining guide](https://www.skan.ai/blogs/pros-and-cons-of-task-mining)) — except you get clean semantic events for free instead of reconstructing them from screenshots with CV.
- **Flow mining (frequent sequences → named flows).** Mapping repeated UI-event subsequences to candidate automations is a solved-enough problem: frequent sequential-pattern mining (PrefixSpan-family) over segmented UI logs, filtering for sequences that are frequent, coherent (same task context), and automatable ([Leno et al., candidate routines from UI logs](https://arxiv.org/pdf/2008.05782); [discovering executable routines](https://arxiv.org/pdf/2106.13446)). At app scale this is a periodic background job over a local SQLite table, not ML infrastructure.
- **Workflow memory / RAG over traces.** **Agent Workflow Memory** (Wang et al., ICML 2025) showed that inducing reusable workflows from past agent trajectories and injecting them into the prompt improves web-agent success by 24.6% (Mind2Web) and 51.1% relative (WebArena) while *reducing* steps ([AWM paper](https://arxiv.org/abs/2409.07429)). Same idea applies to user traces: retrieve the k most similar past traces/flows for the current intent and let the LLM instantiate parameters. **Preference learning** at this scale means simple statistics, not RLHF: per-user priors (default schemas, favorite connections, typical export format) learned by counting, surfaced as flow parameter defaults.
- **Cautionary tales.** **Rabbit R1's "LAM"** was marketed as a model that "learns any interface by watching humans"; teardowns found ChatGPT for intent plus hand-written **Playwright scripts** for its four supported apps, running on cloud VMs holding user credentials ([AINIRO teardown](https://ainiro.io/blog/rabbit-r1-textbook-ai-based-pump-and-dump), [Tom's Guide follow-up](https://www.tomsguide.com/ai/i-just-tested-rabbit-r1s-next-generation-lam-is-this-what-the-company-actually-promised)). The lesson isn't "they lied" so much as: *even a company whose entire pitch was learned UI actuation shipped deterministic scripted flows, because that's what works.* **Adept ACT-1** — the original "transformer that uses your software" demo — never shipped as a product; training custom action models was so expensive the company was acqui-hired into Amazon in 2024 ([TechCrunch](https://techcrunch.com/2024/12/09/amazon-forms-a-new-ai-agent-focused-lab-led-by-adept-co-founder/), [eesel retrospective](https://www.eesel.ai/blog/adept-ai)). Lesson: don't train action models; compose an off-the-shelf LLM with deterministic execution.

---

## 4. Recommended architecture (Studio-specific, local-first)

```
React components ──useAnchor()──► Anchor Registry (runtime, in-memory + manifest)
        │                              │
   user events                    agent actions (invoke by anchor_id)
        ▼                              ▲
  Trace Recorder ──► SQLite (local) ──► Flow Miner (periodic, PrefixSpan-style)
                          │                    │
                          ▼                    ▼
              Trace/Flow embeddings ◄── Flow Store (declarative YAML/JSON flows:
              (small local model)        curated + mined, versioned in-app)
                          │
User intent ─► embed ─► match flow ─► LLM fills parameters ─► Flow Runner
                (fallback: LLM plans step-by-step over registry)
```

1. **Runtime anchor registry.** A React hook (`useAnchor("connection.form.host", {role:"textbox", description:"Exasol host", actions:["fill"]})`) registers each actionable component on mount with a stable hierarchical ID, semantics, and current enabled/visible state; Tauri commands expose `list_anchors(route)` and `invoke(anchor_id, action, params)`. This *is* your accessibility tree, but curated and stable across redesigns. Anchor IDs are the contract — treat renames as breaking changes with a migration map.
2. **Declarative flows.** Named step sequences over anchors with typed parameters, preconditions (route/state), and per-step verification (`expect: anchor visible`). Ship core flows hand-written (create connection, import CSV, run query, export result). Deterministic execution, LLM only for parameter extraction — this is the Rabbit lesson applied honestly.
3. **Trace recorder.** Log every anchor-mediated user event to local SQLite (no raw keystrokes; hash or elide values for sensitive fields). Also log agent-executed steps, so agent successes/failures feed the same corpus.
4. **Periodic flow mining.** A background job segments traces (idle gaps, route changes), runs frequent-sequence mining, and proposes candidate flows ("you did *open connection → set schema → run script → export* 14 times — save as a flow?"). Human-confirms → named flow. This is the practical form of "learning from user behavior," per AWM and the task-mining literature above.
5. **Intent → flow matching.** Embed flow names/descriptions and recent traces with a small local embedding model (~30–120MB: bge-small, all-MiniLM, or EmbeddingGemma via ONNX/fastembed in the Rust side). User request → embed → top-k flows → local or API LLM picks one and fills parameters, or falls back to step-by-step planning over `list_anchors`. Everything except the (optional) planning LLM runs offline.

**What to skip:** JEPA/world-model training, vision-based grounding of your own UI, any per-user model fine-tuning, cloud trace storage. **What compounds:** the anchor registry (it also gives you free E2E-test hooks and real accessibility), the trace corpus, and the mined flow library — each is useful even if the LLM layer changes entirely.
