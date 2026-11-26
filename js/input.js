export const MAX_STICK_R = 52;

export const sticks = {
  move: { id: null, sx: 0, sy: 0, dx: 0, dy: 0 },
  look: { id: null, sx: 0, sy: 0, dx: 0, dy: 0 }
};

export const keys = {};
export let sprintHeld = false;

export function initInput(canvas, player, { onGrab, onDoor, onRepair, onRotate, onToggleBag }) {
  const sprintBtn = document.getElementById('sprint-btn');
  const grabBtn = document.getElementById('grab-btn');
  const doorBtn = document.getElementById('door-btn');
  const repairBtn = document.getElementById('repair-btn');
  const rotateBtn = document.getElementById('rotate-btn');

  canvas.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      const side = t.clientX < window.innerWidth / 2 ? 'move' : 'look';
      if (sticks[side].id === null) {
        sticks[side] = { id: t.identifier, sx: t.clientX, sy: t.clientY, dx: 0, dy: 0 };
      }
    }
  });

  canvas.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      for (const side of ['move', 'look']) {
        const s = sticks[side];
        if (s.id === t.identifier) {
          const vx = t.clientX - s.sx;
          const vy = t.clientY - s.sy;
          const dist = Math.hypot(vx, vy);
          const clamped = Math.min(dist, MAX_STICK_R);
          const ang = Math.atan2(vy, vx);
          s.dx = (Math.cos(ang) * clamped) / MAX_STICK_R;
          s.dy = (Math.sin(ang) * clamped) / MAX_STICK_R;
        }
      }
    }
  });

  function endTouch(e) {
    for (const t of e.changedTouches) {
      for (const side of ['move', 'look']) {
        if (sticks[side].id === t.identifier) {
          sticks[side] = { id: null, sx: 0, sy: 0, dx: 0, dy: 0 };
        }
      }
    }
  }
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);

  sprintBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    sprintHeld = true;
    sprintBtn.classList.add('active');
  });
  sprintBtn.addEventListener('touchend', (e) => {
    e.preventDefault();
    sprintHeld = false;
    sprintBtn.classList.remove('active');
  });
  sprintBtn.addEventListener('touchcancel', () => {
    sprintHeld = false;
    sprintBtn.classList.remove('active');
  });
  sprintBtn.addEventListener('mousedown', () => {
    sprintHeld = true;
    sprintBtn.classList.add('active');
  });
  window.addEventListener('mouseup', () => {
    sprintHeld = false;
    sprintBtn.classList.remove('active');
  });

  grabBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onGrab();
  });
  grabBtn.addEventListener('click', onGrab);

  doorBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onDoor();
  });
  doorBtn.addEventListener('click', onDoor);

  repairBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onRepair();
  });
  repairBtn.addEventListener('click', onRepair);

  rotateBtn.addEventListener('click', onRotate);

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (k === 'e') onGrab();
    if (k === 'f') onDoor();
    if (k === 'r') onRepair();
    if (k === 'q') onRotate();
    if (k === 'b' || k === 'i') onToggleBag();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (sticks.look.id === null) {
      player.angle = Math.atan2(
        e.clientY - window.innerHeight / 2,
        e.clientX - window.innerWidth / 2
      );
    }
  });
}
