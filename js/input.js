export const MAX_STICK_R = 54;

export const sticks = {
  move: { id: null, sx: 0, sy: 0, dx: 0, dy: 0 },
  look: { id: null, sx: 0, sy: 0, dx: 0, dy: 0 }
};

export const keys = {};
export let sprintHeld = false;

export function initInput(canvas, player, callbacks) {
  const { onGrab, onDoor, onRepair, onSpecial, onRotate, onToggleBag } = callbacks;

  // Prevent iPad Safari double-tap zoom & pinch zoom anywhere on screen
  let lastTouchEnd = 0;
  document.addEventListener(
    'touchend',
    (e) => {
      const now = Date.now();
      if (now - lastTouchEnd <= 320) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );

  document.addEventListener(
    'gesturestart',
    (e) => {
      e.preventDefault();
    },
    { passive: false }
  );

  // Bind HUD buttons on pointerdown so they trigger immediately while holding the movement stick
  const bindInstantButton = (id, handler) => {
    const el = document.getElementById(id);
    if (!el || !handler) return;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
  };

  bindInstantButton('grab-btn', onGrab);
  bindInstantButton('door-btn', onDoor);
  bindInstantButton('repair-btn', onRepair);
  bindInstantButton('special-btn', onSpecial);
  bindInstantButton('rotate-btn', onRotate);
  bindInstantButton('bag-btn', onToggleBag);

  const sprintBtn = document.getElementById('sprint-btn');
  if (sprintBtn) {
    sprintBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sprintHeld = true;
    });
    const releaseSprint = (e) => {
      e.stopPropagation();
      sprintHeld = false;
    };
    sprintBtn.addEventListener('pointerup', releaseSprint);
    sprintBtn.addEventListener('pointercancel', releaseSprint);
    sprintBtn.addEventListener('pointerleave', releaseSprint);
  }

  // Dual-stick touch controls directly on the game canvas (never blocks HUD buttons)
  canvas.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const isLeftHalf = t.clientX < window.innerWidth * 0.5;
        if (isLeftHalf && sticks.move.id === null) {
          sticks.move.id = t.identifier;
          sticks.move.sx = t.clientX;
          sticks.move.sy = t.clientY;
          sticks.move.dx = 0;
          sticks.move.dy = 0;
        } else if (!isLeftHalf && sticks.look.id === null) {
          sticks.look.id = t.identifier;
          sticks.look.sx = t.clientX;
          sticks.look.sy = t.clientY;
          sticks.look.dx = 0;
          sticks.look.dy = 0;
        }
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === sticks.move.id) {
          const rx = t.clientX - sticks.move.sx;
          const ry = t.clientY - sticks.move.sy;
          const dist = Math.hypot(rx, ry);
          const clamped = Math.min(dist, MAX_STICK_R);
          const ang = Math.atan2(ry, rx);
          sticks.move.dx = dist > 4 ? (Math.cos(ang) * clamped) / MAX_STICK_R : 0;
          sticks.move.dy = dist > 4 ? (Math.sin(ang) * clamped) / MAX_STICK_R : 0;
        } else if (t.identifier === sticks.look.id) {
          const rx = t.clientX - sticks.look.sx;
          const ry = t.clientY - sticks.look.sy;
          const dist = Math.hypot(rx, ry);
          const clamped = Math.min(dist, MAX_STICK_R);
          const ang = Math.atan2(ry, rx);
          sticks.look.dx = dist > 4 ? (Math.cos(ang) * clamped) / MAX_STICK_R : 0;
          sticks.look.dy = dist > 4 ? (Math.sin(ang) * clamped) / MAX_STICK_R : 0;
        }
      }
    },
    { passive: false }
  );

  const endTouch = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === sticks.move.id) {
        sticks.move.id = null;
        sticks.move.dx = 0;
        sticks.move.dy = 0;
      } else if (t.identifier === sticks.look.id) {
        sticks.look.id = null;
        sticks.look.dx = 0;
        sticks.look.dy = 0;
      }
    }
  };

  canvas.addEventListener('touchend', endTouch, { passive: false });
  canvas.addEventListener('touchcancel', endTouch, { passive: false });

  // Keyboard & mouse fallback for desktop testing
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === 'e' && onDoor) onDoor();
    if (k === 'f' && onGrab) onGrab();
    if (k === 'q' && onRotate) onRotate();
    if (k === 'b' || k === 'i' || k === 'escape') {
      if (onToggleBag) onToggleBag();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    if (sticks.look.id !== null) return;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    player.angle = Math.atan2(e.clientY - cy, e.clientX - cx);
  });
}
