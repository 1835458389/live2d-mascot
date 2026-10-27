// Full-screen Live2D mascot built with pixi-live2d-display, loading the
// official "Hiyori" sample model (Cubism 4), sourced directly from Live2D's
// own Live2D/CubismWebSamples repo (Samples/Resources/Hiyori), which its
// LICENSE.md explicitly lists under the Free Material License.
//
// This content uses sample data owned and copyrighted by Live2D Inc. The
// sample data are utilized in accordance with terms and conditions set by
// Live2D Inc. This content itself is created at the author's sole discretion.
// (Required notice per https://www.live2d.com/eula/live2d-sample-model-terms_en.html)
//
// Gaze tracking, blinking and idle motion are the library's/model's own
// built-in behaviors (autoInteract + Cubism's internal EyeBlink + idle
// MotionManager) — this file just adds a walk/idle state machine on top and
// wires up click reactions using the model's hit areas.

(async function () {
  const PIXI = window.PIXI;
  const { Live2DModel } = PIXI.live2d;
  const MotionPriority = PIXI.live2d.MotionPriority || { NONE: 0, IDLE: 1, NORMAL: 2, FORCE: 3 };

  const canvas = document.getElementById("canvas");
  const loading = document.getElementById("loading");
  const hint = document.getElementById("hint");
  const floorShadow = document.getElementById("floorShadow");
  const modeLabel = document.getElementById("modeLabel");
  const toggleBtn = document.getElementById("toggleBtn");

  const app = new PIXI.Application({
    view: canvas,
    resizeTo: window,
    backgroundAlpha: 0,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    antialias: true,
  });

  const MODEL_URL = "./models/hiyori/Hiyori.model3.json";

  const model = await Live2DModel.from(MODEL_URL, { autoInteract: true });
  loading.style.opacity = "0";
  setTimeout(() => loading.remove(), 500);

  app.stage.addChild(model);
  model.anchor.set(0.5, 1); // anchor at her feet, so model.y == ground level

  // ---------------------------------------------------------------------
  // Layout / sizing
  // ---------------------------------------------------------------------
  let baseScale = 1;
  let groundY = 0;
  let facing = 1; // 1 = facing/walking right, -1 = facing/walking left

  function layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    baseScale = (h * 0.62) / model.internalModel.originalHeight;
    model.scale.set(baseScale * facing, baseScale);
    groundY = h - Math.max(20, h * 0.035);
    model.y = groundY;
    model.x = Math.min(Math.max(model.x, 100), w - 100);
  }

  model.x = window.innerWidth / 2;
  layout();
  window.addEventListener("resize", layout);

  // ---------------------------------------------------------------------
  // Idle <-> Walk state machine
  // ---------------------------------------------------------------------
  // Hiyori's own animation set (Idle x9 / TapBody) has no dedicated "walk
  // cycle" — she's a bust-style demo model, not a game sprite. So "walking"
  // here means: she actually strolls to a new spot on screen (with a little
  // footstep bob and turning to face the direction she's headed) while her
  // body motion keeps playing; "idle" means she plants herself and just
  // plays her native idle sway/blink loop in place.
  let mode = "idle"; // "idle" | "walk"
  let walkTargetX = model.x;
  const WALK_SPEED = 95; // px / second
  let autoWanderAt = performance.now() + 3500 + Math.random() * 3000;

  function pickWalkTarget() {
    const margin = 110;
    const w = window.innerWidth;
    walkTargetX = margin + Math.random() * Math.max(1, w - margin * 2);
    facing = walkTargetX >= model.x ? 1 : -1;
    model.scale.x = baseScale * facing;
  }

  function setMode(next) {
    mode = next;
    modeLabel.textContent = mode === "walk" ? "Walking" : "Idle";
    toggleBtn.textContent = mode === "walk" ? "⏸ Stop" : "🚶 Walk";
    if (mode === "walk") {
      pickWalkTarget();
      model.motion("TapBody", undefined, MotionPriority.NORMAL);
    } else {
      model.y = groundY;
    }
  }

  toggleBtn.addEventListener("click", () => {
    setMode(mode === "walk" ? "idle" : "walk");
    if (mode === "idle") autoWanderAt = performance.now() + 4000 + Math.random() * 5000;
  });

  app.ticker.add(() => {
    const dtMs = app.ticker.deltaMS;

    if (mode === "walk") {
      const dx = walkTargetX - model.x;
      const step = WALK_SPEED * (dtMs / 1000);
      if (Math.abs(dx) <= step) {
        model.x = walkTargetX;
        setMode("idle");
        autoWanderAt = performance.now() + 4000 + Math.random() * 5000;
      } else {
        model.x += Math.sign(dx) * step;
        model.y = groundY - Math.abs(Math.sin(performance.now() * 0.012)) * 9;
      }
    } else if (performance.now() > autoWanderAt) {
      setMode("walk");
    }

    floorShadow.style.left = model.x + "px";
    floorShadow.style.opacity = mode === "walk" ? "0.55" : "0.8";
  });

  // ---------------------------------------------------------------------
  // Gaze tracking — pixi-live2d-display already auto-tracks the pointer
  // over the canvas (autoInteract), this just widens it to the whole page
  // so she keeps looking at the cursor even outside her own bounding box.
  // ---------------------------------------------------------------------
  window.addEventListener("pointermove", (e) => {
    model.focus(e.clientX, e.clientY);
  });

  // ---------------------------------------------------------------------
  // Click reactions via the model's own hit area. Hiyori's model.json only
  // defines a single "Body" hit area (and no Expressions at all), so every
  // successful hit just plays her TapBody reaction motion.
  // ---------------------------------------------------------------------
  window.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hitAreas = model.hitTest(x, y);
    if (!hitAreas.length) return;

    hint.style.opacity = "0";
    model.motion("TapBody", undefined, MotionPriority.FORCE);
  });
})().catch((err) => {
  console.error(err);
  const loading = document.getElementById("loading");
  if (loading) loading.textContent = "Failed to load: " + err.message;
});
