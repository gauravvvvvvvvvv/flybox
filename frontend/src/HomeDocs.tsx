import type { ReactNode } from "react";
import type { RuntimeState } from "./types";

type EnterHandler = () => void;

const WORLD_ELEMENTS = [
  ["🍌", "FRUIT", "Edible object. Emits an experimental ORN_DM1/ORN_DM2 odor field. In PLAY, a hungry agent can forage toward it, stop to feed, gain energy, and eventually consume it."],
  ["〰", "ODOR PAINT", "Non-edible smell. Paint trails across the arena to drive the same olfactory input without giving the agent food."],
  ["◎", "TARGET", "A visual point of interest. Drives the LC10a target encoder. PLAY adds a visible target-seeking body assist; PURE LAB removes that assist."],
  ["●", "LOOM", "Threat-like expanding object. Angular growth drives LPLC2; a close threat can also drive LC4. PLAY treats it as something to evade."],
  ["☠", "PREDATOR", "A draggable threat that can catch an agent. PLAY prioritizes predator avoidance over food, targets, and wandering."],
  ["🔊", "SOUND", "Pulsing sound source. Drives JO-A/JO-B auditory populations. PLAY gives it a weaker orienting response."],
  ["💡", "LIGHT", "Visible world cue. The compact browser connectome export does not include photoreceptor azimuth metadata, so LIGHT currently affects only the explicitly labeled PLAY orientation assist and is not injected into fake photoreceptors."],
  ["█", "WALL", "Solid obstacle. Nearby frontal walls drive an experimental LPLC1 small-object/approach signal; PLAY turns away before collision. Physical contact also drives SNta touch."],
  ["🏁", "GOAL", "A challenge destination. In PLAY it behaves like a target and is used by race-style modes."],
] as const;

const BEHAVIOR = [
  ["1", "TOUCH REFLEX", "If an agent physically touches a wall, the tactile reflex gets first priority and turns hard away."],
  ["2", "PREDATOR / LOOM", "Threats override normal exploration. The body turns away strongly and can enter ESCAPING / EVADING states."],
  ["3", "WALL AVOIDANCE", "An obstacle ahead causes a pre-collision turn. Contact is the fallback, not the normal behavior."],
  ["4", "ARENA EDGE", "The agent begins turning inward before the box boundary. If it still reaches the edge, its heading reflects and it continues instead of sticking to the border."],
  ["5", "TARGET / GOAL", "PLAY deliberately steers toward targets and goals so these objects visibly matter."],
  ["6", "FOOD / ODOR", "A hungry agent follows the odor field. As odor improves, random searching is suppressed."],
  ["7", "LIGHT / SOUND", "These produce weaker orientation behavior so they influence the body without overpowering danger, walls, or food."],
  ["8", "EXPLORE", "With no strong cue, PLAY uses a deterministic search wobble so the agent explores instead of moving forever in a perfect straight line."],
] as const;

const MODES = [
  ["PLAY", "The fun layer. Real FlyBrain neural activity runs underneath, while clearly labeled game assists make the body forage, orient, avoid threats/walls, explore, feed, race, and survive."],
  ["LAB", "The inspection layer. See real simulated firing, named motor populations, sensory channels, interventions, divergence, batch probes, and real MaleCNS soma anatomy when the compact anatomy asset is present. PURE LAB removes the PLAY locomotion assists."],
  ["BUILD", "World editor. Place, drag, remove, randomize, and paint elements. Also controls day/night presentation, wind, daily seeded worlds, and ephemeral-session information."],
  ["WEIRD", "Experimental toys: body swaps, neural fireworks, brain tone, brain forks, brain-to-brain artificial coupling, Chaos Button, and Cinema Mode."],
] as const;

const CHALLENGES = [
  ["SNACK ATTACK", "Finish several food items."],
  ["DON'T GET SQUISHED", "Keep at least one agent alive against a moving predator."],
  ["YOU vs FLY", "You drag the predator; the fly tries to survive."],
  ["FLY RACE", "First agent to the glowing goal wins."],
  ["BRAIN CAR", "Put the connectome in a car body and race it."],
  ["MAZE RUN", "Navigate walls and reach food at the far end."],
  ["MUTATION TOURNAMENT", "Modified rivals compete in one arena, including explicit seeded interventions such as LC4-OFF and LESION-5%."],
  ["CONNECTOME HIJACK", "Reach a descending-neuron target using a limited stimulation budget."],
  ["MYSTERY BRAIN", "One agent receives a hidden reproducible intervention. Experiment and then reveal it."],
  ["RECENT HISTORY", "Start from an exact matched brain fork, give the two neural states different recent sensory histories, then remove all cues and compare them in the same neutral test. This tests short-term state/history dependence—not learned memory."],
  ["SANDBOX", "No objective. Build a world and mess with the connectome."],
] as const;

const BODIES = [
  ["🪰", "FLY", "Default embodiment."],
  ["🚗", "CAR", "Faster artificial body."],
  ["🤖", "BOT", "Slower robotic body."],
  ["✣", "DRONE", "Fast aerial-style visual body."],
  ["🕷", "WALKER", "Slower many-legged body."],
  ["🚀", "SHIP", "Fast ship-like body."],
  ["🎹", "SYNTH", "Stationary embodiment intended for neural/audio experimentation."],
] as const;

const SENSORS = [
  ["Fruit / odor", "ORN_DM1 + ORN_DM2", "Experimental olfactory encoder"],
  ["Target / goal", "LC10a", "Experimental visual target encoder"],
  ["Looming object", "LPLC2", "Angular-growth / looming encoder"],
  ["Close threat", "LC4", "Threat encoder"],
  ["Wall ahead", "LPLC1", "Experimental small-object / approach encoder"],
  ["Wall contact", "SNta", "Tactile input"],
  ["Sound", "JO-A / JO-B", "Auditory input"],
  ["Light", "No neural injection in browser mode", "PLAY-only orientation cue until photoreceptor metadata is added"],
] as const;

const MOTORS = [
  ["FORWARD", "DNg100", "Read as forward-drive signal"],
  ["STEERING", "DNa02 L/R", "Left/right difference feeds the engineering steering decoder"],
  ["ESCAPE", "DNp01", "Strong activity can trigger the escape body response"],
  ["BACKWARD", "MDN", "Feeds reverse drive"],
] as const;

function DocsCard({ icon, title, children }: { icon?: string; title: string; children: ReactNode }) {
  return (
    <article className="home-doc-card">
      <div className="home-doc-card-title">{icon && <span>{icon}</span>}<b>{title}</b></div>
      <div className="home-doc-card-body">{children}</div>
    </article>
  );
}

export default function HomeDocs({ onEnter, runtime }: { onEnter: EnterHandler; runtime?: RuntimeState }) {
  return (
    <main className="home-docs">
      <div className="home-doc-grid" />

      <nav className="home-doc-nav">
        <a className="home-doc-logo" href="#top">FLYBOX</a><span className="home-live-url">BROWSER-COMPUTE RUNTIME</span>
        <div className="home-doc-links">
          <a href="#controls">CONTROLS</a>
          <a href="#elements">ELEMENTS</a>
          <a href="#behavior">BEHAVIOR</a>
          <a href="#modes">MODES</a>
          <a href="#science">SCIENCE</a>
          <a href="/docs">DEEP DOCS ↗</a>
        </div>
        <button className="home-enter-mini" onClick={onEnter}>OPEN SANDBOX</button>
      </nav>

      <section className="home-hero" id="top">
        <div className="eyebrow">FLYBOX / REAL CONNECTOME, WEIRD PLAYGROUND</div>
        <h1>Put a fly brain<br /><span>in a world.</span></h1>
        <p className="home-lede">
          A disposable interactive sandbox around a simplified fruit-fly connectome simulation.
          Feed it, scare it, build around it, change its brain, swap its body, fork time, or inspect
          what the neural model actually did.
        </p>
        <div className="home-hero-actions">
          <button className="enter" onClick={onEnter}>OPEN THE SANDBOX</button>
          <a className="home-secondary" href="#controls">QUICK OVERVIEW ↓</a>
          <a className="home-secondary" href="/docs">FULL TECHNICAL DOCS ↗</a>
        </div>
        <div className={`home-brain-warmup ${runtime?.status ?? "loading"}`}>
          <i />
          <span>
            {runtime?.status === "ready"
              ? "BRAIN READY"
              : runtime?.status === "error"
                ? "BRAIN LOAD ERROR"
                : "BRAIN LOADS LOCALLY WHEN YOU OPEN THE SANDBOX"}
          </span>
        </div>
        <div className="home-stat-row">
          <div><strong>166,700</strong><span>NEURONS</span></div>
          <div><strong>25.09M</strong><span>BROWSER GRAPH EDGES</span></div>
          <div><strong>20 ms</strong><span>NEURAL STEP</span></div>
          <div><strong>EPHEMERAL</strong><span>NO ACCOUNTS / NO SAVED SESSION</span></div>
        </div>
        <p className="home-disclaimer">
          FLYBOX does not claim to reproduce a complete biological fly, exact natural behavior, cognition,
          or consciousness. Real connectome-derived simulation outputs are separated from experimental
          encoders/decoders and game mechanics throughout the UI.
        </p>
      </section>

      <section className="home-section" id="controls">
        <div className="home-section-head">
          <span>01</span>
          <div><h2>How to use the box</h2><p>You can understand the whole interaction model in under a minute.</p></div>
        </div>
        <div className="home-doc-grid-cards home-controls-grid">
          <DocsCard icon="◉" title="LEFT CLICK"><p>Select a world tool, then left-click the arena to place it.</p></DocsCard>
          <DocsCard icon="🖐" title="HAND / DRAG"><p>Switch to HAND to select or drag an agent or placed world object.</p></DocsCard>
          <DocsCard icon="⌫" title="RIGHT CLICK"><p><b>Right-click any placed world element to remove that exact element immediately.</b> Right-click empty space does nothing.</p></DocsCard>
          <DocsCard icon="⌨" title="POSSESS / WASD"><p>Possess the selected body and drive it with WASD or arrow keys while its neural simulation continues receiving sensory input.</p></DocsCard>
          <DocsCard icon="⏱" title="TIME CONTROLS"><p>Pause, resume, advance exactly +20 ms, reset, or run at 0.05× / 0.25× / 1× / 2× / 5× / 10×.</p></DocsCard>
          <DocsCard icon="↶" title="SAVE MOMENT / REWIND"><p>Save the exact browser neural/game state and rewind to it later in the same temporary sandbox.</p></DocsCard>
        </div>
      </section>

      <section className="home-section" id="elements">
        <div className="home-section-head">
          <span>02</span>
          <div><h2>Everything you can put in the world</h2><p>Every element is labeled inside the arena. Right-click any of them to delete it.</p></div>
        </div>
        <div className="home-elements">
          {WORLD_ELEMENTS.map(([icon, title, description]) => (
            <DocsCard key={title} icon={icon} title={title}><p>{description}</p></DocsCard>
          ))}
        </div>
      </section>

      <section className="home-section" id="behavior">
        <div className="home-section-head">
          <span>03</span>
          <div><h2>What the agent does in PLAY</h2><p>PLAY uses an explicit reflex hierarchy so the body behaves like a creature instead of a cursor moving in a straight line.</p></div>
        </div>
        <div className="home-behavior-list">
          {BEHAVIOR.map(([number, title, description]) => (
            <div className="home-behavior-row" key={title}>
              <span>{number}</span><b>{title}</b><p>{description}</p>
            </div>
          ))}
        </div>
        <div className="home-callout">
          <b>PLAY ASSIST ≠ BIOLOGY</b>
          <p>
            These reflexes are deliberately visible in the sidebar as GAME ASSIST signals. They make the sandbox
            playable. Switch the agent to <strong>PURE LAB</strong> to remove them and leave movement to the named
            connectome-derived motor readouts plus the engineering decoder.
          </p>
        </div>
      </section>

      <section className="home-section" id="modes">
        <div className="home-section-head">
          <span>04</span>
          <div><h2>Four surfaces, one simulation</h2><p>The same running sandbox is presented differently depending on what you want to do.</p></div>
        </div>
        <div className="home-mode-grid">
          {MODES.map(([title, description]) => (
            <DocsCard key={title} title={title}><p>{description}</p></DocsCard>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <span>05</span>
          <div><h2>Body swaps</h2><p>The connectome can drive intentionally artificial bodies. Body mapping is a game/experimental layer.</p></div>
        </div>
        <div className="home-body-grid">
          {BODIES.map(([icon, title, description]) => (
            <DocsCard key={title} icon={icon} title={title}><p>{description}</p></DocsCard>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <span>06</span>
          <div><h2>Challenges</h2><p>Structured reasons to play with the same sandbox mechanics.</p></div>
        </div>
        <div className="home-challenge-grid">
          {CHALLENGES.map(([title, description]) => (
            <DocsCard key={title} title={title}><p>{description}</p></DocsCard>
          ))}
        </div>
      </section>

      <section className="home-section" id="science">
        <div className="home-section-head">
          <span>07</span>
          <div><h2>What goes into the brain</h2><p>World events are converted into explicitly documented experimental sensory inputs.</p></div>
        </div>
        <div className="home-table">
          <div className="home-table-row home-table-head"><span>WORLD</span><span>FLYBRAIN INPUT</span><span>ROLE</span></div>
          {SENSORS.map(([world, population, role]) => (
            <div className="home-table-row" key={world}><b>{world}</b><code>{population}</code><span>{role}</span></div>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <span>08</span>
          <div><h2>What comes out of the brain</h2><p>Named descending-neuron populations feed an explicit engineering body decoder.</p></div>
        </div>
        <div className="home-table">
          <div className="home-table-row home-table-head"><span>ACTION</span><span>READOUT</span><span>USE</span></div>
          {MOTORS.map(([action, population, use]) => (
            <div className="home-table-row" key={action}><b>{action}</b><code>{population}</code><span>{use}</span></div>
          ))}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <span>09</span>
          <div><h2>LAB tools</h2><p>Open the simulation instead of only watching the body.</p></div>
        </div>
        <div className="home-doc-grid-cards">
          <DocsCard title="LIVE CONNECTOME VIEW"><p>Shows live real-connectome firing metrics and population activity, plus real MaleCNS soma XYZ anatomy from the compact browser anatomy asset.</p></DocsCard>
          <DocsCard title="BRAIN SURGERY"><p>Stimulate, silence, or restore named populations. Apply deterministic seeded random synapse lesions.</p></DocsCard>
          <DocsCard title="SENSORY GAIN"><p>Scale how strongly the selected agent receives sandbox sensory injections.</p></DocsCard>
          <DocsCard title="A/B DIVERGENCE"><p>When multiple agents exist, compare firing-set Jaccard divergence, physical separation, and energy differences live.</p></DocsCard>
          <DocsCard title="BATCH PROBE"><p>Run multiple neural states against one shared real FlyBrain connectome graph for a named-population stimulation probe.</p></DocsCard>
          <DocsCard title="EXPORT JSON"><p>Explicitly download the current experiment configuration, trajectories, interventions, events, and other recorded session data.</p></DocsCard>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <span>10</span>
          <div><h2>Weird things</h2><p>Because a connectome sandbox should also be fun to break.</p></div>
        </div>
        <div className="home-doc-grid-cards">
          <DocsCard title="FORK THIS BRAIN"><p>Create another agent from the same moment/state where exact copying is supported, then change one side and watch the realities diverge.</p></DocsCard>
          <DocsCard title="BRAIN → BRAIN"><p>Feed one agent's previous descending-neuron activity into a named sensory population of another. This is explicitly artificial coupling.</p></DocsCard>
          <DocsCard title="NEURAL FIREWORKS"><p>Overlay recent mapped firing activity around the embodied agent.</p></DocsCard>
          <DocsCard title="BRAIN TONE"><p>Turn live neural readouts into an audible oscillator. It is sonification, not biological fly sound.</p></DocsCard>
          <DocsCard title="CHAOS BUTTON"><p>Apply a reproducible seeded lesion to the selected brain.</p></DocsCard>
          <DocsCard title="CINEMA MODE"><p>Hide the laboratory chrome and watch the arena, trajectories, races, and chases full-screen.</p></DocsCard>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <span>11</span>
          <div><h2>Truth labels</h2><p>FLYBOX intentionally tells you which parts come from the connectome and which parts we invented around it.</p></div>
        </div>
        <div className="home-truth-grid">
          <DocsCard title="CONNECTOME DATA"><p>Cell types, sides, graph weights, named populations, and available position metadata from FlyBrain/MaleCNS.</p></DocsCard>
          <DocsCard title="SIMULATED NEURAL DYNAMICS"><p>Spikes and traces produced by FlyBrain's simplified leaky integrate-and-fire simulation.</p></DocsCard>
          <DocsCard title="EXPERIMENTAL ENCODER"><p>Our mapping from sandbox world events into voltage injections for documented sensory populations.</p></DocsCard>
          <DocsCard title="EXPERIMENTAL DECODER"><p>Our mapping from named descending-neuron activity into body speed, steering, escape, and reverse.</p></DocsCard>
          <DocsCard title="GAME MECHANIC"><p>Energy, hunger, PLAY reflexes, feeding rules, wind, bodies, scores, challenges, achievements, and other sandbox rules.</p></DocsCard>
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <span>12</span>
          <div><h2>Your sandbox disappears</h2><p>There are deliberately no accounts or persistent personal sessions.</p></div>
        </div>
        <div className="home-session-box">
          <div><b>OPEN PAGE</b><span>Fresh browser-instance ID</span></div>
          <div className="home-arrow">→</div>
          <div><b>OPEN SANDBOX</b><span>Temporary in-memory FlyBrain world</span></div>
          <div className="home-arrow">→</div>
          <div><b>LEAVE PAGE</b><span>Sandbox discarded</span></div>
        </div>
        <p className="home-session-copy">
          A second tab gets a separate sandbox. FLYBOX does not automatically save or restore your world.
          Time Machine checkpoints live only inside the current temporary sandbox. JSON export happens only when you explicitly request it.
        </p>
      </section>

      <section className="home-section home-final">
        <div className="eyebrow">YOU KNOW WHAT THE BUTTONS DO NOW</div>
        <h2>Open the box.</h2>
        <p>Start with PLAY. Drop fruit somewhere, put a wall in the path, drag a predator nearby, then open LAB and see what changed.</p>
        <button className="enter" onClick={onEnter}>ENTER FLYBOX</button>
      </section>
    </main>
  );
}
