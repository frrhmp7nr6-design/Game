import { worldLoot, worldToScreen, canWalkTo } from './map.js';
import { sticks, keys, sprintHeld, initInput } from './input.js';
import { initInventory, grabLootAt } from './inventory.js';
import { renderFrame } from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const hpFill = document.getElementById('hp-fill');
const stamFill = document.getElementById('stam-fill');
const foodFill = document.getElementById('food-fill');
const hpVal = document.getElementById('hp-val');
const stamVal = document.getElementById('stam-val');
const foodVal = document.getElementById('food-val');
const coordsEl = document.getElementById('coords');
const grabBtn = document.getElementById('grab-btn');
const gameOverEl = document.getElementById('gameover');

function resize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const player = {
  x: 4.5,
  y: 4.5,
  radius: 0.28,
  angle: Math.PI / 4,
  walkSpeed: 4.2,
  sprintSpeed: 7.2,
  hp: 100,
  maxHp: 100,
  stamina: 100,
  maxStamina: 100,
  hunger: 85,
  maxHunger: 100,
  isSprinting: false,
  exhausted: false,
  dead: false
};

let nearbyLootIndex = -1;

const { toggleBag } = initInventory(player);

initInput(canvas, player, {
  onGrab: () => {
    if (grabLootAt(player, nearbyLootIndex)) {
      nearbyLootIndex = -1;
      grabBtn.classList.remove('visible');
    }
  },
  onToggleBag: toggleBag
});

function update(dt) {
  if (player.dead) return;

  let sx = sticks.move.dx;
  let sy = sticks.move.dy;
  if (keys['w'] || keys['arrowup']) sy -= 1;
  if (keys['s'] || keys['arrowdown']) sy += 1;
  if (keys['a'] || keys['arrowleft']) sx -= 1;
  if (keys['d'] || keys['arrowright']) sx += 1;

  const isMoving = Math.hypot(sx, sy) > 0.1;
  const wantsSprint = sprintHeld || keys['shift'];

  // Stamina logic
  if (wantsSprint && isMoving && player.stamina > 0 && !player.exhausted) {
    player.isSprinting = true;
    player.stamina = Math.max(0, player.stamina - 24 * dt);
    if (player.stamina === 0) player.exhausted = true;
  } else {
    player.isSprinting = false;
    const regenRate = isMoving ? 10 : 18;
    player.stamina = Math.min(player.maxStamina, player.stamina + regenRate * dt);
    if (player.stamina >= 25) player.exhausted = false;
  }

  // Hunger & Starvation logic
  const hungerDrain = player.isSprinting ? 2.2 : isMoving ? 1.1 : 0.6;
  player.hunger = Math.max(0, player.hunger - hungerDrain * dt);

  if (player.hunger === 0) {
    player.hp = Math.max(0, player.hp - 4.5 * dt);
  } else if (player.hunger > 60 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + 1.5 * dt);
  }

  if (player.hp <= 0) {
    player.dead = true;
    gameOverEl.classList.add('show');
    return;
  }

  // Movement
  if (isMoving) {
    const speed = player.isSprinting ? player.sprintSpeed : player.walkSpeed;
    const wx = sx + sy * 2;
    const wy = sy * 2 - sx;
    const len = Math.hypot(wx, wy) || 1;
    const vx = (wx / len) * speed * dt;
    const vy = (wy / len) * speed * dt;

    if (canWalkTo(player.x + vx, player.y, player.radius)) player.x += vx;
    if (canWalkTo(player.x, player.y + vy, player.radius)) player.y += vy;

    if (Math.hypot(sticks.look.dx, sticks.look.dy) <= 0.15 && sticks.move.id !== null) {
      const screenMove = worldToScreen(player.x + vx, player.y + vy, 0, 0);
      const screenCurr = worldToScreen(player.x, player.y, 0, 0);
      player.angle = Math.atan2(screenMove.y - screenCurr.y, screenMove.x - screenCurr.x);
    }
  }

  if (Math.hypot(sticks.look.dx, sticks.look.dy) > 0.15) {
    player.angle = Math.atan2(sticks.look.dy, sticks.look.dx);
  }

  // Proximity check for loot
  nearbyLootIndex = -1;
  for (let i = 0; i < worldLoot.length; i++) {
    if (Math.hypot(worldLoot[i].x - player.x, worldLoot[i].y - player.y) < 1.15) {
      nearbyLootIndex = i;
      break;
    }
  }

  if (nearbyLootIndex !== -1) {
    grabBtn.innerHTML = `GRAB<br/><span style="font-size:10px;font-weight:500;">${worldLoot[nearbyLootIndex].name}</span>`;
    grabBtn.classList.add('visible');
  } else {
    grabBtn.classList.remove('visible');
  }

  // HUD updates
  hpFill.style.width = `${player.hp}%`;
  stamFill.style.width = `${player.stamina}%`;
  stamFill.style.background = player.exhausted ? '#94a3b8' : '#38bdf8';
  foodFill.style.width = `${player.hunger}%`;
  foodFill.style.background = player.hunger < 25 ? '#ef4444' : '#f59e0b';

  hpVal.textContent = `${Math.ceil(player.hp)}%`;
  stamVal.textContent = `${Math.ceil(player.stamina)}%`;
  foodVal.textContent = `${Math.ceil(player.hunger)}%`;
  coordsEl.textContent = `${player.x.toFixed(1)}, ${player.y.toFixed(1)}`;
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  update(dt);
  renderFrame(ctx, player, nearbyLootIndex);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
