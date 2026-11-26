import { worldLoot, radioTower, worldToScreen, canWalkTo } from './map.js';
import { sticks, keys, sprintHeld, initInput } from './input.js';
import {
  inventory,
  initInventory,
  grabLootAt,
  installRadioPartsFromBag,
  showToast
} from './inventory.js';
import { updateCombat, WEAPONS, zombies, spawnEvacHorde } from './combat.js';
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
const repairBtn = document.getElementById('repair-btn');
const missionPctEl = document.getElementById('mission-pct');
const missionSubEl = document.getElementById('mission-sub');
const missionFillEl = document.getElementById('mission-fill');
const gameOverEl = document.getElementById('gameover');

function resize() {
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const player = {
  x: 7.5,
  y: 7.5,
  radius: 0.28,
  angle: Math.PI / 4,
  walkSpeed: 4.4,
  sprintSpeed: 7.4,
  hp: 100,
  maxHp: 100,
  stamina: 100,
  maxStamina: 100,
  hunger: 85,
  maxHunger: 100,
  equippedWeapon: 'fists',
  attackTimer: 0,
  hurtFlash: 0,
  isSprinting: false,
  exhausted: false,
  dead: false,
  won: false
};

let nearbyLootIndex = -1;

const { toggleBag } = initInventory(player);

function handleRepair() {
  const distToTower = Math.hypot(radioTower.x - player.x, radioTower.y - player.y);
  if (distToTower > 1.8 || radioTower.evacActive || radioTower.complete) return;

  const added = installRadioPartsFromBag(player);
  if (added === 0) {
    showToast('Bring Radio Parts from town to repair!');
    return;
  }

  const total = radioTower.installedParts.length;
  showToast(`Installed ${added} part(s)! (${total}/${radioTower.requiredParts})`);

  if (total >= radioTower.requiredParts) {
    radioTower.evacActive = true;
    spawnEvacHorde();
    showToast('📡 SIGNAL SENT! Survive 30s until extraction!');
  }
}

initInput(canvas, player, {
  onGrab: () => {
    if (grabLootAt(player, nearbyLootIndex)) {
      nearbyLootIndex = -1;
      grabBtn.classList.remove('visible');
    }
  },
  onRepair: handleRepair,
  onToggleBag: toggleBag
});

function getObjectiveTarget() {
  const carryingPart = inventory.some((i) => i.type === 'part');
  const remainingWorldParts = worldLoot.filter((i) => i.type === 'part');

  if (carryingPart || remainingWorldParts.length === 0 || radioTower.evacActive) {
    return { x: radioTower.x, y: radioTower.y, isTower: true };
  }

  let closest = null;
  let bestDist = Infinity;
  for (const part of remainingWorldParts) {
    const d = Math.hypot(part.x - player.x, part.y - player.y);
    if (d < bestDist) {
      bestDist = d;
      closest = { x: part.x, y: part.y, isTower: false };
    }
  }
  return closest;
}

function update(dt) {
  if (player.dead || player.won) return;

  let sx = sticks.move.dx;
  let sy = sticks.move.dy;
  if (keys['w'] || keys['arrowup']) sy -= 1;
  if (keys['s'] || keys['arrowdown']) sy += 1;
  if (keys['a'] || keys['arrowleft']) sx -= 1;
  if (keys['d'] || keys['arrowright']) sx += 1;

  const isMoving = Math.hypot(sx, sy) > 0.1;
  const wantsSprint = sprintHeld || keys['shift'];

  if (wantsSprint && isMoving && player.stamina > 0 && !player.exhausted) {
    player.isSprinting = true;
    player.stamina = Math.max(0, player.stamina - 22 * dt);
    if (player.stamina === 0) player.exhausted = true;
  } else {
    player.isSprinting = false;
    const regenRate = isMoving ? 11 : 19;
    player.stamina = Math.min(player.maxStamina, player.stamina + regenRate * dt);
    if (player.stamina >= 25) player.exhausted = false;
  }

  const hungerDrain = player.isSprinting ? 1.0 : isMoving ? 0.5 : 0.25;
  player.hunger = Math.max(0, player.hunger - hungerDrain * dt);

  if (player.hunger === 0) {
    player.hp = Math.max(0, player.hp - 0.65 * dt);
  } else if (player.hunger > 65 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + 1.2 * dt);
  }

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

  updateCombat(dt, player);

  if (player.hp <= 0) {
    player.dead = true;
    gameOverEl.querySelector('h1').style.color = '#ef4444';
    gameOverEl.querySelector('h1').textContent = player.hunger === 0 ? 'YOU STARVED' : 'YOU DIED';
    gameOverEl.querySelector('p').textContent =
      player.hunger === 0
        ? 'Open your backpack to eat stored food before fullness hits 0%.'
        : 'Keep zombies inside your vision cone so your weapon auto-attacks.';
    gameOverEl.classList.add('show');
    return;
  }

  if (radioTower.evacActive && !radioTower.complete) {
    radioTower.evacTimer = Math.max(0, radioTower.evacTimer - dt);
    missionPctEl.textContent = `EVAC IN ${Math.ceil(radioTower.evacTimer)}s`;
    missionSubEl.textContent = 'Defend the SE Compound until the chopper lands!';
    missionFillEl.style.width = `${((30 - radioTower.evacTimer) / 30) * 100}%`;

    if (radioTower.evacTimer === 0) {
      radioTower.complete = true;
      player.won = true;
      gameOverEl.querySelector('h1').style.color = '#4ade80';
      gameOverEl.querySelector('h1').textContent = '🚁 EXTRACTED!';
      gameOverEl.querySelector('p').textContent =
        'You repaired the Evac Radio Tower and survived the horde.';
      gameOverEl.classList.add('show');
      return;
    }
  } else {
    const installed = radioTower.installedParts.length;
    const inBag = inventory.filter((i) => i.type === 'part').length;
    missionPctEl.textContent = `${installed}/${radioTower.requiredParts} INSTALLED`;
    missionSubEl.textContent =
      inBag > 0
        ? `Carrying ${inBag} part(s) — follow green arrow to SE Tower!`
        : 'Follow cyan compass arrow to scavenge Radio Parts';
    missionFillEl.style.width = `${(installed / radioTower.requiredParts) * 100}%`;
  }

  const distToTower = Math.hypot(radioTower.x - player.x, radioTower.y - player.y);
  const hasPartInBag = inventory.some((i) => i.type === 'part');
  if (distToTower <= 1.8 && hasPartInBag && !radioTower.evacActive) {
    repairBtn.classList.add('visible');
  } else {
    repairBtn.classList.remove('visible');
  }

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

  const wName = WEAPONS[player.equippedWeapon]?.name || 'Fists';
  hpFill.style.width = `${player.hp}%`;
  stamFill.style.width = `${player.stamina}%`;
  stamFill.style.background = player.exhausted ? '#94a3b8' : '#38bdf8';
  foodFill.style.width = `${player.hunger}%`;
  foodFill.style.background = player.hunger < 25 ? '#ef4444' : '#f59e0b';

  hpVal.textContent = `${Math.ceil(player.hp)}%`;
  stamVal.textContent = `${Math.ceil(player.stamina)}%`;
  foodVal.textContent = `${Math.ceil(player.hunger)}%`;
  coordsEl.textContent = `${wName} • ${player.x.toFixed(0)},${player.y.toFixed(0)}`;
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  update(dt);
  renderFrame(ctx, player, nearbyLootIndex, getObjectiveTarget());

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
