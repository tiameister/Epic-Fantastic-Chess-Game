/**
 * DiceAnimator — 3-D CSS dice for Backgammon.
 *
 * Each die is a perspective-wrapped cube with 6 faces, each bearing
 * the correct pip layout for values 1-6.  Rolling is implemented via
 * the Web Animations API: the cube rotates forward by several full
 * turns and lands on the correct face.  Cumulative rotations are
 * tracked so successive rolls always move forward (no visual reset).
 *
 * Public API
 * ─────────────────────────────────────────────────────────────────
 *   const da  = new DiceAnimator(containerEl);
 *   const els = da.build(count);        // returns array of scene elements
 *   await da.roll([v1, v2, ...]);       // animates to those values
 *   da.showRolled(values);              // instant update, no animation
 */

/** rotateX/Y deltas to bring each face value to the front */
const FACE_ANGLES = {
  1: { rx: 0,    ry: 0   },  // front
  2: { rx: 0,    ry: 90  },  // left  (cube turns right → left face shows)
  // rotateX direction was inverted for top/bottom visual mapping.
  3: { rx: 90,   ry: 0   },  // bottom
  4: { rx: -90,  ry: 0   },  // top
  5: { rx: 0,    ry: -90 },  // right (cube turns left  → right shows)
  6: { rx: 0,    ry: 180 },  // back
};

/**
 * Pip layouts: 9 cells in reading order (3×3 grid).
 * true = pip present, false = invisible placeholder.
 */
const PIP_LAYOUTS = {
  1: [false,false,false, false,true, false, false,false,false],
  2: [false,false,true,  false,false,false, true, false,false],
  3: [false,false,true,  false,true, false, true, false,false],
  4: [true, false,true,  false,false,false, true, false,true ],
  5: [true, false,true,  false,true, false, true, false,true ],
  6: [true, false,true,  true, false,true,  true, false,true ],
};

function buildFace(value) {
  const face = document.createElement("div");
  const grid = document.createElement("div");
  grid.className = "die-pip-grid";

  PIP_LAYOUTS[value].forEach(on => {
    const pip = document.createElement("div");
    pip.className = `die-pip${on ? "" : " invisible"}`;
    grid.appendChild(pip);
  });

  face.appendChild(grid);
  return face;
}

/**
 * A single Die instance bound to one `.die-3d-scene` element.
 */
class Die {
  constructor(sceneEl) {
    this._scene = sceneEl;
    this._cube  = sceneEl.querySelector(".die-3d-cube");
    this._rx    = 0; // cumulative rotateX in degrees
    this._ry    = 0; // cumulative rotateY in degrees
    this._anim  = null;
  }

  /** Immediately show a value with no animation. */
  show(value) {
    if (this._anim) { this._anim.cancel(); this._anim = null; }
    const { rx, ry } = FACE_ANGLES[value] ?? FACE_ANGLES[1];
    this._rx = rx;
    this._ry = ry;
    this._cube.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
  }

  /**
   * Animate to `value`.  Returns a Promise that resolves when
   * the die has landed.  `delay` staggers multiple dice.
   */
  async roll(value, delay = 0) {
    if (this._anim) { this._anim.cancel(); this._anim = null; }

    const { rx: targetRX, ry: targetRY } = FACE_ANGLES[value] ?? FACE_ANGLES[1];

    // Compute how many extra degrees we need to add to reach the target face
    // while always spinning forward (i.e. adding positive rotation).
    const addRX = positiveRemainder(targetRX - this._rx) +
                  (Math.floor(Math.random() * 2) + 2) * 360;
    const addRY = positiveRemainder(targetRY - this._ry) +
                  (Math.floor(Math.random() * 2) + 2) * 360;

    const fromRX = this._rx;
    const fromRY = this._ry;
    const toRX   = fromRX + addRX;
    const toRY   = fromRY + addRY;

    const mid1RX = fromRX + addRX * 0.38;
    const mid1RY = fromRY + addRY * 0.45;
    const mid2RX = fromRX + addRX * 0.72;
    const mid2RY = fromRY + addRY * 0.78;

    const dur = 820 + delay * 80;

    this._anim = this._cube.animate(
      [
        { transform: `rotateX(${fromRX}deg) rotateY(${fromRY}deg)`, easing: "ease-in",                           offset: 0    },
        { transform: `rotateX(${mid1RX}deg) rotateY(${mid1RY}deg)`, easing: "linear",                            offset: 0.38 },
        { transform: `rotateX(${mid2RX}deg) rotateY(${mid2RY}deg)`, easing: "cubic-bezier(0.23, 1, 0.32, 1.1)", offset: 0.72 },
        { transform: `rotateX(${toRX}deg) rotateY(${toRY}deg)`,                                                   offset: 1    },
      ],
      { duration: dur, fill: "forwards" }
    );

    this._rx = toRX;
    this._ry = toRY;

    await this._anim.finished;

    // Commit inline style so we can cancel the fill-forwards cleanly
    this._cube.style.transform = `rotateX(${toRX}deg) rotateY(${toRY}deg)`;
    this._anim.cancel();
    this._anim = null;
  }
}

/** Returns the smallest non-negative remainder of a mod 360. */
function positiveRemainder(deg) {
  return ((deg % 360) + 360) % 360;
}

/** Builds the full HTML for one die scene element. */
function buildDieScene() {
  const scene = document.createElement("div");
  scene.className = "die-3d-scene";

  const cube = document.createElement("div");
  cube.className = "die-3d-cube";

  const FACES = ["face-front","face-back","face-right","face-left","face-top","face-bottom"];
  const VALUES = [1, 6, 5, 2, 4, 3]; // face order: front=1, back=6, right=5, left=2, top=4, bottom=3

  FACES.forEach((cls, i) => {
    const face = buildFace(VALUES[i]);
    face.className = `die-face ${cls}`;
    cube.appendChild(face);
  });

  scene.appendChild(cube);
  return scene;
}

/**
 * DiceAnimator manages N dice inside a container element.
 */
export class DiceAnimator {
  constructor(containerEl) {
    this._container = containerEl;
    this._dice      = []; // Die instances
  }

  /**
   * (Re)builds `count` dice in the container, replacing any existing ones.
   * Returns the array of `.die-3d-scene` elements (for layout purposes).
   */
  build(count) {
    this._container.innerHTML = "";
    this._dice = [];

    for (let i = 0; i < count; i++) {
      const scene = buildDieScene();
      this._container.appendChild(scene);
      this._dice.push(new Die(scene));
    }

    return this._dice.map(d => d._scene);
  }

  /**
   * Animate all dice simultaneously landing on `values` (array of ints 1-6).
   * Returns a Promise that resolves when the last die settles.
   */
  async roll(values) {
    await Promise.all(
      values.map((v, i) => this._dice[i]?.roll(v, i))
    );
  }

  /** Instant (no animation) update to the given values. */
  showRolled(values) {
    values.forEach((v, i) => this._dice[i]?.show(v));
  }

  /** Add/remove greyed-out appearance for used dice. */
  markUsed(indices) {
    this._dice.forEach((d, i) => {
      d._scene.style.opacity = indices.includes(i) ? "0.38" : "1";
    });
  }
}
