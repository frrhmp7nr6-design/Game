import {
  camera,
  rotateCamera,
  convoyGarage,
  quarryCampfire,
  worldToScreen,
  canWalkTo,
  getNearbyLootList
} from './map.js';
import {
  getActiveChunks,
  getZoneInfo,
  openedDoors,
  doorDamage,
  lootedIds,
  killedZombieIds
} from './chunks.js';
import { sticks, keys, sprintHeld, initInput } from './input.js';
import {
  inventory,
  applyArchetypeLoadout,
  initInventory,
  grabLootItem,
  deliverConvoySupplies,
  hasLockpick,
  consumeLockpick,
  showToast
} from './inventory.js';
import { updateCombat, WEAPONS, fxList } from './combat.js';
import { renderFrame, renderMinimap } from './render.js';
import {
  initNetwork,
  broadcastPlayerState,
  broadcastWorldEvent,
  remotePlayers
} from './net.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const mctx = miniCanvas.getContext('2d');

const archModal = document.getElementById('archetype-modal');
const archBadge = document.getElementById('arch-badge');
const hpFill = document.getElementById('hp-fill');
const stamFill = document.getElementById('stam-fill');
const foodFill = document.getElementById('food-fill');
const hpVal = document.getElementById('hp-val');
const stamVal = document.getElementById('stam-val');
const foodVal = document.getElementById('food-val');
const coordsEl = document.getElementById('coords');
const grabBtn = document.getElementById('grab-btn');
const doorBtn = document.getElementById('door-btn');
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
  x: 510.5,
  y: 510.5,
  radius: 0.28,
  angle: Math.PI / 4,
  walkSpeed: 4.5,
  sprintSpeed: 7.6,
  archetype: 'bruiser',
  bagCapacity: 8,
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
  started: false
};

let activeChunks = getActiveChunks(player.x, player.y, 1);
let nearbyLoot = null;
let nearbyDoor = null;

const { toggleBag } = initInventory(player);

// Connect to Supabase Realtime co-op room
initNetwork(player, {
  onRemoteDoor: ({ key, state }) => {
    if (state === 'open') openedDoors.add(key);
    else openedDoors.delete(key);
    for (const c of activeChunks) {
      const d = c.doors.find((item) => item.key === key);
      if (d) d.state = state;
    }
  },
  onRemoteLoot: ({ id }) => {
    lootedIds.add(id);
    for (const c of activeChunks) {
      const idx = c.loot.findIndex((item) => item.id === id);
      if (idx !== -1) c.loot.splice(idx, 1);
    }
  },
  onRemoteZombieKill: ({ id }) => {
    killedZombieIds.add(id);
    for (const c of activeChunks) {
      const idx = c.zombies.findIndex((z) => z.id === id);
      if (idx !== -1) c.zombies.splice(idx, 1);
    }
  },
  onRemoteConvoy: ({ points }) => {
    if (typeof points === 'number' && points > convoyGarage.points) {
      convoyGarage.points = points;
      showToast(`🚛 Teammate loaded Convoy Supplies! (${points}/${convoyGarage.targetPoints})`);
    }
  }
});

document.querySelectorAll('.arch-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const arch = btn.dataset.arch;
    applyArchetypeLoadout(player, arch);
    archBadge.textContent = arch.toUpperCase();
    archModal.classList.add('hidden');
    player.started = true;
    showToast(`Deployed as ${arch.toUpperCase()} in Quarry Hub`);
  });
});

function handleDoorAction() {
  if (!nearbyDoor || player.dead) return;
  const d = nearbyDoor;

  if (d.state === 'unlocked') {
    d.state = 'open';
    openedDoors.add(d.key);
    broadcastWorldEvent({ kind: 'door', key: d.key, state: 'open' });
    showToast('Opened door');
    return;
  }

  if (d.state === 'open') {
    if (Math.floor(player.x) === d.x && Math.floor(player.y) === d.y) {
      showToast('Step out of doorway first');
      return;
    }
    d.state = 'unlocked';
    openedDoors.delete(d.key);
    broadcastWorldEvent({ kind: 'door', key: d.key, state: 'unlocked' });
    showToast('Closed door');
    return;
  }

  if (d.state === 'locked') {
    if (hasLockpick()) {
      consumeLockpick(player);
      d.state = 'open';
      openedDoors.add(d.key);
      broadcastWorldEvent({ kind: 'door', key: d.key, state: 'open' });
      showToast('🔓 Picked lock!');
      return;
    }
    smashDoor(d);
    return;
  }

  if (d.state === 'barricaded') {
    smashDoor(d);
  }
}

function smashDoor(d) {
  const weapon = WEAPONS[player.equippedWeapon] || WEAPONS.fists;
  if (weapon.type === 'ranged') {
    showToast('Equip a Crowbar or Fire Axe to smash doors!');
    return;
  }
  if (player.stamina < 10) {
    showToast('Too exhausted to bash door!');
    return;
  }

  player.stamina = Math.max(0, player.stamina - 10);
  const dmg = player.archetype === 'bruiser' ? Math.round(weapon.damage * 1.35) : weapon.damage;
  d.hp = Math.max(0, d.hp - dmg);
  doorDamage.set(d.key, d.hp);

  fxList.push({
    type: 'melee',
    fromX: player.x,
    fromY: player.y,
    toX: d.x + 0.5,
    toY: d.y + 0.5,
    angle: player.angle,
    life: 0.16,
    maxLife: 0.16
  });

  if (d.hp === 0) {
    d.state = 'open';
    openedDoors.add(d.key);
    broadcastWorldEvent({ kind: 'door', key: d.key, state: 'open' });
    showToast('💥 Smashed door open!');
  } else {
    showToast(`Bashed door (${Math.ceil((d.hp / d.maxHp) * 100)}% left)`);
  }
}

function handleConvoyLoad() {
  const distToGarage = Math.hypot(convoyGarage.x - player.x, convoyGarage.y - player.y);
  if (distToGarage > 2.2) return;

  const added = deliverConvoySupplies(player);
  if (added === 0) {
    showToast('Scavenge Scrap Plating, Fuel & Armor in Threat Rings!');
    return;
  }

  broadcastWorldEvent({ kind: 'convoy', points: convoyGarage.points });
  showToast(
    `🚛 Loaded +${added} Convoy Supplies! (${convoyGarage.points}/${convoyGarage.targetPoints})`
  );
}

initInput(canvas, player, {
  onGrab: () => {
    const targetItem = nearbyLoot;
    if (grabLootItem(player, targetItem, activeChunks)) {
      if (targetItem && targetItem.id) {
        broadcastWorldEvent({ kind: 'loot', id: targetItem.id });
      }
      nearbyLoot = null;
      grabBtn.classList.remove('visible');
    }
  },
  onDoor: handleDoorAction,
  onRepair: handleConvoyLoad,
  onRotate: () => {
    const rot = rotateCamera();
    showToast(`Camera: ${rot * 90}°`);
  },
  onToggleBag: toggleBag
});

function getObjectiveTarget() {
  const carryingConvoy = inventory.some((i) => i.type === 'convoy');
  if (carryingConvoy) {
    return { x: convoyGarage.x, y: convoyGarage.y, isGarage: true };
  }

  const lootList = getNearbyLootList(activeChunks);
  let closest = null;
  let bestDist = Infinity;
  for (const item of lootList) {
    if (item.type === 'convoy') {
      const d = Math.hypot(item.x - player.x, item.y - player.y);
      if (d < bestDist) {
        bestDist = d;
        closest = { x: item.x, y: item.y, isGarage: false };
      }
    }
  }
  return closest;
}

function update(dt) {
  if (!player.started || player.dead) return;

  activeChunks = getActiveChunks(player.x, player.y, 1);

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

  const hungerDrain = player.isSprinting ? 0.95 : isMoving ? 0.45 : 0.2;
  player.hunger = Math.max(0, player.hunger - hungerDrain * dt);

  // Campfire healing + Medic aura (both self and nearby Medic allies)
  const nearCampfire = Math.hypot(quarryCampfire.x - player.x, quarryCampfire.y - player.y) < 3.2;
  let nearAllyMedic = false;
  for (const rp of remotePlayers.values()) {
    if (rp.archetype === 'medic' && Math.hypot(rp.x - player.x, rp.y - player.y) < 4.5) {
      nearAllyMedic = true;
      break;
    }
  }

  if (nearCampfire && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + 4.5 * dt);
  } else if (
    (player.archetype === 'medic' || nearAllyMedic) &&
    player.hp < player.maxHp &&
    player.hunger > 25
  ) {
    player.hp = Math.min(player.maxHp, player.hp + 1.8 * dt);
  }

  if (player.hunger === 0) {
    player.hp = Math.max(0, player.hp - 0.65 * dt);
  } else if (player.hunger > 65 && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + 1.1 * dt);
  }

  if (isMoving) {
    const speed = player.isSprinting ? player.sprintSpeed : player.walkSpeed;
    const rx = sx + sy * 2;
    const ry = sy * 2 - sx;
    const len = Math.hypot(rx, ry) || 1;
    const rvx = (rx / len) * speed * dt;
    const rvy = (ry / len) * speed * dt;

    let vx = rvx;
    let vy = rvy;
    if (camera.rotation === 1) {
      vx = rvy;
      vy = -rvx;
    } else if (camera.rotation === 2) {
      vx = -rvx;
      vy = -rvy;
    } else if (camera.rotation === 3) {
      vx = -rvy;
      vy = rvx;
    }

    if (canWalkTo(player.x + vx, player.y, player.radius, activeChunks)) player.x += vx;
    if (canWalkTo(player.x, player.y + vy, player.radius, activeChunks)) player.y += vy;

    if (Math.hypot(sticks.look.dx, sticks.look.dy) <= 0.15 && sticks.move.id !== null) {
      const screenMove = worldToScreen(player.x + vx, player.y + vy, 0, 0);
      const screenCurr = worldToScreen(player.x, player.y, 0, 0);
      player.angle = Math.atan2(screenMove.y - screenCurr.y, screenMove.x - screenCurr.x);
    }
  }

  if (Math.hypot(sticks.look.dx, sticks.look.dy) > 0.15) {
    player.angle = Math.atan2(sticks.look.dy, sticks.look.dx);
  }

  updateCombat(dt, player, activeChunks);
  broadcastPlayerState(player);

  if (player.hp <= 0) {
    player.dead = true;
    gameOverEl.querySelector('h1').textContent = player.hunger === 0 ? 'YOU STARVED' : 'YOU DIED';
    gameOverEl.querySelector('p').textContent =
      player.hunger === 0
        ? 'Eat stored rations from your backpack before fullness hits 0%.'
        : 'Return to the Quarry Campfire to heal up between Threat Ring runs.';
    gameOverEl.classList.add('show');
    return;
  }

  const inBagPoints = inventory
    .filter((i) => i.type === 'convoy')
    .reduce((sum, i) => sum + (i.value || 1), 0);
  missionPctEl.textContent = `${convoyGarage.points} / ${convoyGarage.targetPoints} SUPPLIES`;
  missionSubEl.textContent =
    inBagPoints > 0
      ? `Carrying +${inBagPoints} supplies — follow green arrow to Quarry Garage!`
      : 'Explore Threat Rings 1–3 for Scrap Plating, Fuel & Military Armor';
  missionFillEl.style.width = `${(convoyGarage.points / convoyGarage.targetPoints) * 100}%`;

  nearbyDoor = null;
  let bestDoorDist = 1.45;
  for (const c of activeChunks) {
    for (const d of c.doors) {
      const dist = Math.hypot(d.x + 0.5 - player.x, d.y + 0.5 - player.y);
      if (dist < bestDoorDist) {
        bestDoorDist = dist;
        nearbyDoor = d;
      }
    }
  }

  if (nearbyDoor) {
    let label = 'OPEN<br/>DOOR';
    if (nearbyDoor.state === 'open') label = 'CLOSE<br/>DOOR';
    else if (nearbyDoor.state === 'locked') {
      label = hasLockpick() ? 'PICK<br/>LOCK' : 'BASH<br/>DOOR';
    } else if (nearbyDoor.state === 'barricaded') {
      label = 'SMASH<br/>BOARDS';
    }
    doorBtn.innerHTML = label;
    doorBtn.classList.add('visible');
  } else {
    doorBtn.classList.remove('visible');
  }

  const distToGarage = Math.hypot(convoyGarage.x - player.x, convoyGarage.y - player.y);
  if (distToGarage <= 2.2 && inBagPoints > 0) {
    repairBtn.classList.add('visible');
  } else {
    repairBtn.classList.remove('visible');
  }

  nearbyLoot = null;
  let bestLootDist = 1.15;
  for (const item of getNearbyLootList(activeChunks)) {
    const d = Math.hypot(item.x - player.x, item.y - player.y);
    if (d < bestLootDist) {
      bestLootDist = d;
      nearbyLoot = item;
    }
  }

  if (nearbyLoot) {
    grabBtn.innerHTML = `GRAB<br/><span style="font-size:10px;font-weight:500;">${nearbyLoot.name}</span>`;
    grabBtn.classList.add('visible');
  } else {
    grabBtn.classList.remove('visible');
  }

  const zone = getZoneInfo(player.x, player.y);
  hpFill.style.width = `${(player.hp / player.maxHp) * 100}%`;
  stamFill.style.width = `${player.stamina}%`;
  stamFill.style.background = player.exhausted ? '#94a3b8' : '#38bdf8';
  foodFill.style.width = `${player.hunger}%`;
  foodFill.style.background = player.hunger < 25 ? '#ef4444' : '#f59e0b';

  hpVal.textContent = `${Math.ceil(player.hp)}/${player.maxHp}`;
  stamVal.textContent = `${Math.ceil(player.stamina)}%`;
  foodVal.textContent = `${Math.ceil(player.hunger)}%`;
  coordsEl.style.color = zone.color;
  coordsEl.textContent = `${zone.name} • ${Math.floor(player.x)},${Math.floor(player.y)}`;
}

let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;

  update(dt);
  renderFrame(ctx, player, activeChunks, nearbyLoot, nearbyDoor, getObjectiveTarget());
  renderMinimap(mctx, player, activeChunks);

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
