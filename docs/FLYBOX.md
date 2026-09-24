# FLYBOX — Complete Product & Technical Guide

FLYBOX is a disposable interactive sandbox around a simplified fruit-fly connectome simulation.

**Runtime:** browser-compute-first; production hosting can be static/CDN-only.

The product has two goals at the same time:

1. Be immediately fun for a casual user, kid, developer, or curious person.
2. Keep scientific/technical boundaries explicit enough that a researcher can tell which signals come from FlyBrain and which behaviors are experimental/game logic.

FLYBOX is **not** presented as a complete biological fly, an exact reconstruction of natural Drosophila behavior, cognition, or consciousness.

---

## 1. Core idea

The main loop is:

```text
WORLD
  ↓
experimental sensory encoding
  ↓
FlyBrain connectome simulation
  ↓
named descending-neuron activity
  ↓
experimental body decoder
  ↓
PLAY reflex/game layer (optional)
  ↓
BODY MOVEMENT
  ↓
new world position / sensory state
```

The simulation is closed-loop: the body moves, that changes what it senses next, and the connectome continues evolving.

---

## 2. Neural model

The real FlyBrain-compatible browser runtime is used by default.

Current browser graph scale:

- 166,700 neurons
- 25,088,107 recurrent graph edges in the compact web export
- default neural timestep: 20 ms

The worker loads FlyBrain's commit-pinned web export, reconstructs the CSC graph into TypedArrays, and advances real recurrent leaky-integrate-and-fire state locally on the visitor's CPU.

The Python/FastAPI FlyBrain implementation remains in the repository as an optional reference/development backend. Browser mode does not silently fall back to fake neural activity if the real graph fails to load.

---

## 3. Ephemeral session model

FLYBOX deliberately has:

- no accounts
- no login
- no user database
- no persistent profile
- no automatic save
- no cross-user shared world

A browser page creates one temporary sandbox.

```text
OPEN PAGE
   ↓
fresh page/session id
   ↓
OPEN SANDBOX
   ↓
temporary in-memory FlyBrain world
   ↓
LEAVE PAGE
   ↓
sandbox discarded
```

Important details:

- A second tab receives a different sandbox.
- Other visitors do not share the same world.
- The live sandbox is owned by one browser Web Worker.
- Stateful commands are local worker RPC messages; no server affinity is needed.
- Leaving/closing the page terminates the worker and its in-memory neural/world state.
- Refreshing creates a new sandbox.
- Time Machine checkpoints exist only in the current sandbox.
- JSON export is explicit and user-initiated.

---

# 4. Homepage

Before entering the simulation, users see the complete product manual.

The homepage explains:

- controls
- every world element
- behavior priority
- PLAY vs LAB
- bodies
- challenges
- sensory mappings
- motor mappings
- LAB tools
- weird/experimental tools
- scientific truth labels
- ephemeral session behavior

The homepage has sticky navigation and an **OPEN SANDBOX** button at both the top and bottom.

---

# 5. Basic controls

## Left click

With a world tool selected:

- left-click the arena to place that element

With HAND selected:

- click an agent to select/grab it
- click a world object to drag it

## Right click

Right-click any placed world object to remove that exact element immediately.

Supported deletion includes:

- fruit
- odor
- target
- wall
- loom
- predator
- sound
- light
- goal

Right-click on empty space does nothing.

Right-click is reserved for deletion and does not trigger placement.

## Drag

With HAND:

- drag agents
- drag placed objects

## Possess

Click **POSSESS**.

Then use:

- W / Up = forward
- S / Down = reverse
- A / Left = turn left
- D / Right = turn right

Possession adds a manual body command while the neural simulation continues to receive sensory input.

## Time controls

- PAUSE
- PLAY
- +20 ms single step
- RESET BOX
- 0.05×
- 0.25×
- 1×
- 2×
- 5×
- 10×

---

# 6. World elements

Every placed world element gets a visible label in the arena.

## FRUIT

Purpose:

- edible
- produces odor
- raises energy while feeding

Neural input:

- ORN_DM1
- ORN_DM2

Behavior:

- hungry PLAY agents can forage toward it
- the agent stops while feeding
- energy increases gradually
- the food item is consumed over time

The food-location behavior is not a direct biological command. The odor signal and body assist are separately exposed.

## ODOR PAINT

Purpose:

- draw a smell field without adding edible food

Neural input:

- ORN_DM1
- ORN_DM2

Behavior:

- can influence foraging direction in PLAY
- cannot be eaten
- bounded object count prevents unlimited odor objects

## TARGET

Purpose:

- clear point of interest

Neural input:

- LC10a

PLAY behavior:

- target-seeking body assist
- search wobble is suppressed as the target becomes salient

PURE LAB:

- target assist disappears
- LC10a input remains

## LOOM

Purpose:

- simulate a rapidly threatening/approaching visual object

Neural input:

- LPLC2 using angular growth
- close threat can also drive LC4

PLAY behavior:

- treated as threat
- high avoidance priority

## PREDATOR

Purpose:

- interactive threat
- can physically catch an agent

Behavior:

- draggable
- avoidance gets high priority
- can kill/catch an agent on contact

## SOUND

Purpose:

- pulsing auditory source

Neural input:

- JO-A populations
- JO-B populations

PLAY behavior:

- weaker orienting response
- does not override strong threat or wall avoidance

## LIGHT

Purpose:

- spatial visual light source

Neural input:

- none in the current compact browser export because it does not carry the photoreceptor azimuth metadata required for a defensible spatial light injection

PLAY behavior:

- weaker orientation-like game assist only
- the UI must not present that assist as photoreceptor activity

## WALL / OBSTACLE

Purpose:

- solid physical obstacle

Before contact:

- nearby frontal obstacle is encoded through LPLC1 as an experimental small-object/approach signal
- PLAY uses a pre-collision avoidance reflex

On contact:

- SNta touch input is generated
- PLAY performs a stronger tactile turn

Walls should therefore normally be avoided before collision instead of repeatedly rammed.

## GOAL

Purpose:

- challenge destination

PLAY behavior:

- approached similarly to TARGET

Used by:

- Fly Race
- Brain Car
- other objective modes

---

# 7. PLAY behavior hierarchy

PLAY gives the embodied agent a deterministic reflex/game layer around the neural simulation.

Priority is approximately:

```text
1. TOUCH REFLEX
2. PREDATOR / LOOM AVOIDANCE
3. WALL / OBSTACLE AVOIDANCE
4. ARENA EDGE AVOIDANCE
5. TARGET / GOAL SEEKING
6. FOOD / ODOR FORAGING
7. LIGHT / SOUND ORIENTATION
8. SEARCH / EXPLORATION
```

## Touch reflex

If a wall has already been contacted:

- turn strongly away
- touch has highest immediate priority

## Predator / loom

If a threat is close:

- steer away strongly
- can enter EVADING / ESCAPING state

## Wall avoidance

Before collision:

- detect obstacle ahead
- turn away
- reduce speed when very close

## Arena edge

Before reaching the boundary:

- steer back inward

If the agent still reaches the edge:

- reflect heading
- apply small deterministic deflection
- continue moving

The body should not stay pinned to the border.

## Target / goal

- steer toward target
- increase forward intent modestly
- slow when extremely close

## Food / odor

- hungry agents follow stronger odor
- increasing odor suppresses random search

## Light / sound

- weak orientation
- deliberately lower priority than threats/walls/food/targets

## Exploration

If nothing salient is nearby:

- deterministic search wobble
- prevents endless perfect straight-line travel

---

# 8. PLAY vs PURE LAB

This is a critical product distinction.

## PLAY ASSIST

Designed for:

- fun
- understandability
- challenges
- embodied behavior

Adds explicitly visible game signals:

- FORAGE STEER
- TARGET / GOAL
- SOUND / LIGHT ORIENT
- PREDATOR / LOOM AVOID
- WALL AVOID
- EDGE REFLEX
- SEARCH WOBBLE

These are shown under:

```text
GAME ASSIST · NOT BIOLOGY
```

## PURE LAB

Removes those body assists.

The agent is then driven by:

- FlyBrain neural state
- named descending-neuron readouts
- the engineering body decoder

PURE LAB may therefore be less lively, stop, or behave less obviously.

That is intentional.

---

# 9. Agent states

Examples of visible states include:

- IDLE
- READY
- EXPLORING
- FORAGING
- FEEDING
- SEEKING TARGET
- ORIENTING
- EVADING
- ESCAPING
- AVOIDING WALL
- TURNING INWARD
- BOUNCING
- REVERSING
- POSSESSED
- GRABBED
- CAUGHT
- OUT OF ENERGY

---

# 10. Internal game state

Game-level variables include:

- energy
- hunger
- alive/dead state
- food consumed
- escape count
- body type
- challenge progress

These are GAME MECHANICS, not claims about exact fly physiology.

Hunger modifies food-related PLAY behavior and sensory gain.

---

# 11. Sensory mappings

Current experimental sensory mappings:

| World input | FlyBrain population/input | Role |
|---|---|---|
| Fruit / odor | ORN_DM1 + ORN_DM2 | olfactory |
| Target / goal | LC10a | visual target |
| Looming object | LPLC2 | looming |
| Close threat | LC4 | threat |
| Wall ahead | LPLC1 | small-object / approach |
| Wall contact | SNta | touch |
| Sound | JO-A / JO-B | auditory |
| Light | photoreceptors + azimuth | spatial light |

These are experimental encoders.

They do not represent a complete biological sensory system.

---

# 12. Motor mappings

Named descending-neuron groups:

| Body role | Population |
|---|---|
| Forward | DNg100 |
| Steering | DNa02 L/R |
| Escape | DNp01 |
| Backward | MDN |

Current engineering decoder:

- DNa02 side difference → turn
- DNg100 → forward component
- MDN → reverse component
- DNp01 → escape boost

This is explicitly labeled an **EXPERIMENTAL DECODER**.

---

# 13. Bodies

The same connectome can be embodied as:

## FLY

Default body.

## CAR

Faster artificial body.

## BOT

Slower robotic body.

## DRONE

Fast drone-style visual body.

## WALKER

Slower many-legged body.

## SHIP

Fast ship-like body.

## SYNTH

Stationary body intended for neural/audio experiments.

Body swaps are intentionally artificial.

---

# 14. Challenges

## Snack Attack

Objective:

- consume/finish food items

## Don't Get Squished

Objective:

- survive a moving predator

## You vs Fly

Objective:

- user controls/drags predator
- fly attempts to survive

## Fly Race

Objective:

- reach goal first

## Brain Car

Objective:

- put the connectome in a car body
- race to goal

## Maze Run

Objective:

- avoid walls
- reach food

## Mutation Tournament

Multiple modified agents compete.

Example rivals:

- LC4-OFF
- LESION-5%

These are real explicit interventions, not cosmetic labels.

## Connectome Hijack

Objective:

- use limited stimulation actions
- reach a descending-neuron activity target

## Mystery Brain

One agent receives a hidden intervention.

User experiments to infer it.

Then reveal the secret.

## Recent History

Purpose:

- test whether different recent sensory histories leave different continuing neural states
- avoid claiming associative learning or long-term biological memory

Procedure:

1. FLYBOX creates an exact browser neural-state fork from PRIME.
2. Both bodies are temporarily switched to stationary SYNTH bodies.
3. Brain A receives a short food/odor sensory history.
4. Brain B receives a short loom/threat sensory history.
5. All cues are removed.
6. Both agents are placed at the exact same position and heading.
7. Their original body/controller are restored.
8. FLYBOX measures neural Jaccard divergence and physical trajectory separation during the same cue-free test.

The UI reports:

- current neural divergence
- current spatial divergence
- maximum neural divergence
- maximum behavioral separation
- mean neural divergence over the neutral test

The interpretation is deliberately conservative:

> Different recent sensory histories can leave different continuing simulated neural states. This is short-term state/history dependence, not a claim of learned biological memory.

No plasticity, associative-learning rule, or hidden "memory variable" is added for this challenge.

## Sandbox

No objective.

---

# 15. Multiple agents

Users can:

- spawn agents
- rename agents
- select agents
- remove non-primary agents
- give different bodies
- give different interventions
- compare them

The initial agent is named PRIME but PRIME is not the product.

It is simply the first agent.

---

# 16. Brain fork

Where supported, an agent can be forked from the current moment.

Exact browser neural-state fork copies:

- neural membrane state
- spike state
- RNG state
- neural traces
- intervention state
- synaptic lesion state
- motor smoothing state
- encoder history
- body/world position
- energy
- trajectory/game state

Exact CUDA state copying is not claimed until validated.

---

# 17. Time Machine

## SAVE MOMENT

On CPU/mock:

stores a bounded checkpoint containing:

- neural state
- spike state
- RNG
- trace state
- world objects
- positions
- body state
- energy
- interventions
- queued stimulation
- challenge state
- artificial couplings
- log state

## REWIND

Restores a saved checkpoint.

Checkpoints exist only in the current ephemeral sandbox.

---

# 18. LAB

LAB includes:

## Live brain view

When FlyBrain provides `brain.positions`:

- uses real MaleCNS soma coordinates
- projects x/z axes
- displays bounded structural sample
- overlays recent firing neurons

If coordinates are unavailable:

- no fake anatomy is drawn
- UI explicitly reports unavailable

## Live metrics

Includes:

- fired neuron count
- newly firing count
- DN trace
- firing-set Jaccard distance

## Named motor readout

Shows:

- DNg100
- DNa02 left
- DNa02 right
- DNp01
- MDN

## Sensory display

Shows encoded signals such as:

- food odor
- target
- obstacle
- loom
- danger
- sound
- touch

## Sensory gain

Scale selected agent sensory injection strength.

## Brain surgery

Supported:

- stimulate population
- silence population
- restore population
- seeded random synapse lesion

## A/B divergence

When multiple agents exist:

- firing-set Jaccard divergence
- physical separation
- energy difference

## Batch science probe

Real FlyBrain only.

Runs multiple neural states with:

- shared connectome graph
- chosen named population stimulation
- multiple replicates
- measured firing and DN trace summaries

---

# 19. WHY? explanation card

PLAY provides a plain-language explanation of current behavior.

Examples:

- "It can smell nearby food."
- "It is steering toward the target."
- "It sees a wall in its path and is turning away."
- "It is turning back into the arena."
- "It is orienting toward a sound or light."
- "Its escape channel fired strongly."
- "You are driving the body."

The explanation also states whether the behavior is neural-derived, experimental, or a PLAY assist.

---

# 20. BUILD

BUILD provides:

- world placement
- dragging
- right-click deletion
- odor painting
- random world
- daily seeded world
- clear world
- daylight/night presentation
- wind
- current seed
- ephemeral-session explanation

---

# 21. WEIRD

## Neural Fireworks

Visual overlay derived from bounded firing samples.

## Brain Tone

Maps neural readouts to an oscillator.

This is sonification, not biological fly audio.

## Brain Car

Connectome in car body.

## Synth Brain

Connectome in stationary synth body.

## Brain → Brain

Artificial coupling:

- source agent previous DN activity
- scaled
- injected into named population of target agent

Explicitly labeled:

```text
experimental_artificial_coupling
```

Not claimed as natural fly communication.

## Chaos Button

Applies deterministic seeded random synapse lesion.

## Cinema Mode

Hides UI chrome and shows the arena full-screen.

---

# 22. Achievements

Local session achievements include examples such as:

- FIRST BITE
- ESCAPE ARTIST
- BRAIN SURGEON
- CHAOS THEORY
- PARTY BOX
- WHY DID YOU DO THAT
- SURVIVOR

They disappear with the sandbox.

---

# 23. Developer console

Built-in console examples:

```text
stim LC4 0.8
silence LC10a
restore LC10a
spawn food .5 .5
fork
random 42
challenge race
```

---

# 24. API

Backend:

- browser Web Worker runtime
- TypedArray connectome loader/stepper
- optional FastAPI/WebSocket reference backend

The browser sends stateful sandbox commands over the same WebSocket that owns the temporary sandbox.

This removes hosted simulation compute entirely from the default production path.

The batch probe also runs locally in the browser against the shared immutable graph.

Major operations include:

- simulation pause/resume/step/reset/speed
- agent spawn/remove/rename/body/controller/move/drive
- fork
- world add/remove/move/clear/randomize/daily/environment
- intervention
- sensory gain
- brain coupling
- challenges
- console
- checkpoint/rewind
- export/import experiment
- brain sample
- population status

---

# 25. SDKs

Included:

```text
sdk/python/flybox.py
sdk/js/flybox.ts
examples/hijack.py
```

SDK clients receive their own ephemeral sandbox ID.

---

# 26. Experiment export

JSON export can include:

- format version
- seed
- timestep
- simulation time
- challenge state
- achievements
- world state
- agents
- body/controller
- position
- sensory gain
- interventions
- trajectories
- event log
- artificial couplings

Export is explicit.

It is not automatically persisted by FLYBOX.

---

# 27. Provenance / truth labels

FLYBOX uses five categories.

## CONNECTOME DATA

Examples:

- graph weights
- cell types
- side metadata
- named populations
- soma positions

## SIMULATED NEURAL DYNAMICS

Examples:

- FlyBrain spikes
- traces
- firing sets

## EXPERIMENTAL ENCODER

Examples:

- fruit → ORN_DM1/DM2 voltage input
- target → LC10a
- wall ahead → LPLC1
- loom → LPLC2
- light → photoreceptor drive

## EXPERIMENTAL DECODER

Examples:

- DNa02 → steering
- DNg100 → forward
- MDN → reverse
- DNp01 → escape

## GAME MECHANIC

Examples:

- hunger
- energy
- feeding rules
- PLAY assists
- wall/edge reflex body commands
- bodies
- wind
- achievements
- challenge scoring

---

# 28. What FLYBOX does NOT claim

FLYBOX does not claim:

- complete biological fly simulation
- exact wild-fly behavior
- complete visual system
- complete olfactory system
- exact motor ground truth
- consciousness
- cognition
- biological intent
- biological meaning for artificial body swaps
- biological brain-to-brain communication
- biological meaning for game energy/hunger values

---

# 29. Performance limits

Real FlyBrain uses a large connectome.

Therefore FLYBOX:

- limits simultaneous full agents
- never sends the whole 25M-edge graph to the browser
- sends bounded firing samples
- bounds logs
- bounds odor objects
- uses FlyBrain propagation rather than Python loops over all synapses
- uses native batch support for multi-replicate scientific probes

On Vercel the default full-agent cap is conservative.

---

# 30. Deployment

The repository includes:

```text
Dockerfile.vercel
```

The container:

1. builds the Vite frontend
2. installs the Python backend
3. downloads/bundles FlyBrain data at build time
4. serves frontend + API + WebSocket from one domain

Important deployment environment defaults include:

```text
FLY_DEVICE=cpu
FLYLAB_STATIC_DIR=/app/frontend/dist
FLYLAB_MAX_FLIES=2
FLYLAB_MAX_SESSIONS=2
FLYLAB_SESSION_GRACE_SECONDS=8
```

A platform recycle simply destroys the ephemeral sandbox, which matches the product model.

---

# 31. Repository layout

```text
flybox/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── models/
│   │   └── simulation/
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── Arena.tsx
│   │   ├── BrainView.tsx
│   │   ├── HomeDocs.tsx
│   │   ├── api.ts
│   │   ├── styles.css
│   │   └── types.ts
├── docs/
│   └── FLYBOX.md
├── sdk/
│   ├── js/
│   └── python/
├── examples/
├── Dockerfile.vercel
└── README.md
```

---

# 32. Product philosophy

FLYBOX should feel like:

```text
physics sandbox
+
connectome debugger
+
tiny artificial-life toy
+
neuroscience experiment interface
```

A casual user should be able to:

- add fruit
- move a predator
- create walls
- watch the fly react
- right-click things away
- race a brain car
- swap bodies

A developer should be able to:

- use the console/API/SDK
- create reproducible worlds
- fork states
- connect brains

A scientist should be able to:

- identify exact neural mappings
- inspect traces
- manipulate populations
- compare conditions
- export data
- distinguish model output from game logic

The rule for every future feature is:

> **Make it fun without hiding what is real, simulated, experimental, or invented.**
