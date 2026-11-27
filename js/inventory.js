import { convoyGarage } from './map.js';
import { lootedIds, droppedLoot } from './chunks.js';
import { WEAPONS } from './combat.js';

export const inventory = [];
let toastTimer = null;

export function showToast(msg) {
  const toastEl = document.getElementById('toast');
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

export function applyArchetypeLoadout(player, arch) {
  player.archetype = arch;
  inventory.length = 0;

  if (arch === 'bruiser') {
    player.maxHp = 140;
    player.hp = 140;
    player.bagCapacity = 8;
    player.equippedWeapon = 'crowbar';
    inventory.push({
      id: 'starter-crowbar',
      name: 'Crowbar',
      type: 'weapon',
      weaponId: 'crowbar',
      color: '#38bdf8'
    });
  } else if (arch === 'medic') {
    player.maxHp = 105;
    player.hp = 105;
    player.bagCapacity = 8;
    player.equippedWeapon = 'fists';
    inventory.push(
      { id: 'starter-med-1', name: 'Field Bandage', type: 'med', hunger: 0, hp: 45, color: '#f8fafc' },
      { id: 'starter-med-2', name: 'Field Bandage', type: 'med', hunger: 0, hp: 45, color: '#f8fafc' }
    );
  } else if (arch === 'scavenger') {
    player.maxHp = 100;
    player.hp = 100;
    player.bagCapacity = 10;
    player.equippedWeapon = 'fists';
    inventory.push({
      id: 'starter-masterpick',
      name: 'Master Lockpick',
      type: 'tool',
      toolId: 'lockpick',
      infinite: true,
      color: '#fbbf24'
    });
  } else if (arch === 'marksman') {
    player.maxHp = 95;
    player.hp = 95;
    player.bagCapacity = 8;
    player.equippedWeapon = 'pistol';
    inventory.push({
      id: 'starter-pistol',
      name: '9mm Pistol',
      type: 'weapon',
      weaponId: 'pistol',
      color: '#94a3b8'
    });
  }

  renderBag(player);
}

export function initInventory(player) {
  const bagToggle = document.getElementById('bag-toggle');
  const bagDrawer = document.getElementById('bag-drawer');

  function toggleBag() {
    bagDrawer.classList.toggle('open');
    renderBag(player);
  }

  bagToggle.addEventListener('click', toggleBag);
  renderBag(player);

  return { toggleBag };
}

export function hasLockpick() {
  return inventory.some((i) => i.type === 'tool' && i.toolId === 'lockpick');
}

export function consumeLockpick(player) {
  const idx = inventory.findIndex((i) => i.type === 'tool' && i.toolId === 'lockpick');
  if (idx === -1) return false;
  if (!inventory[idx].infinite) {
    inventory.splice(idx, 1);
    renderBag(player);
  }
  return true;
}

export function renderBag(player) {
  const cap = player.bagCapacity || 8;
  const bagCount = document.getElementById('bag-count');
  const bagSlotsLabel = document.getElementById('bag-slots-label');
  const bagList = document.getElementById('bag-list');

  bagCount.textContent = `${inventory.length}/${cap}`;
  bagSlotsLabel.textContent = `${inventory.length} / ${cap} Slots`;
  bagList.innerHTML = '';

  const eqName = WEAPONS[player.equippedWeapon]?.name || 'Fists';
  const eqBanner = document.createElement('div');
  eqBanner.style.cssText = 'font-size:11px; color:#38bdf8; font-weight:700; padding-bottom:4px;';
  eqBanner.textContent = `EQUIPPED: ${eqName.toUpperCase()}`;
  bagList.appendChild(eqBanner);

  if (inventory.length === 0) {
    bagList.insertAdjacentHTML(
      'beforeend',
      `<div style="color:#64748b; font-size:12px; text-align:center; padding:12px 0;">Bag is empty. Leave the Quarry Hub to scavenge Threat Rings.</div>`
    );
    return;
  }

  inventory.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'bag-item';

    let desc = '';
    if (item.type === 'food') desc = `+${item.hunger}% Fullness, +${item.hp}% HP`;
    else if (item.type === 'med') desc = `+${item.hp}% Health`;
    else if (item.type === 'convoy') desc = `+${item.value} Convoy Supply • Load at Quarry Garage`;
    else if (item.type === 'tool')
      desc = item.infinite ? 'Reusable Scavenger Tool' : 'Opens locked doors silently';
    else if (item.type === 'weapon') {
      const w = WEAPONS[item.weaponId];
      desc = `${w.damage} DMG • ${w.type === 'ranged' ? 'Ranged' : 'Melee'}`;
    }

    const isEquipped = item.type === 'weapon' && player.equippedWeapon === item.weaponId;
    const canUse =
      item.type === 'food' || item.type === 'med' || (item.type === 'weapon' && !isEquipped);
    const useLabel = item.type === 'med' ? 'HEAL' : item.type === 'weapon' ? 'EQUIP' : 'EAT';

    row.innerHTML = `
      <div class="bag-item-info">
        <span class="bag-item-name" style="${
          item.type === 'convoy' ? 'color:#22d3ee;' : item.type === 'tool' ? 'color:#fbbf24;' : ''
        }">${item.name} ${isEquipped ? '<span style="color:#38bdf8;font-size:10px;">(ACTIVE)</span>' : ''}</span>
        <span class="bag-item-sub">${desc}</span>
      </div>
      <div class="bag-btns">
        ${canUse ? `<button class="mini-btn use-btn" data-idx="${idx}">${useLabel}</button>` : ''}
        <button class="mini-btn drop-btn" data-drop="${idx}">DROP</button>
      </div>
    `;
    bagList.appendChild(row);
  });

  bagList.querySelectorAll('.use-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      useBagItem(player, Number(e.currentTarget.dataset.idx));
    });
  });

  bagList.querySelectorAll('.drop-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      dropBagItem(player, Number(e.currentTarget.dataset.drop));
    });
  });
}

export function grabLootItem(player, item, activeChunks) {
  if (!item || player.dead) return false;
  const cap = player.bagCapacity || 8;
  if (inventory.length >= cap) {
    showToast('Backpack is full!');
    return false;
  }

  inventory.push(item);

  const dIdx = droppedLoot.indexOf(item);
  if (dIdx !== -1) {
    droppedLoot.splice(dIdx, 1);
  } else {
    lootedIds.add(item.id);
    for (const c of activeChunks) {
      const idx = c.loot.indexOf(item);
      if (idx !== -1) {
        c.loot.splice(idx, 1);
        break;
      }
    }
  }

  if (item.type === 'convoy') {
    showToast(`🚛 Stashed ${item.name} (+${item.value} Convoy)!`);
  } else if (item.type === 'weapon' && player.equippedWeapon === 'fists') {
    player.equippedWeapon = item.weaponId;
    showToast(`Equipped ${item.name}`);
  } else {
    showToast(`Stashed ${item.name}`);
  }

  renderBag(player);
  return true;
}

export function deliverConvoySupplies(player) {
  let addedPoints = 0;
  for (let i = inventory.length - 1; i >= 0; i--) {
    if (inventory[i].type === 'convoy') {
      addedPoints += inventory[i].value || 1;
      inventory.splice(i, 1);
    }
  }
  if (addedPoints > 0) {
    convoyGarage.points = Math.min(convoyGarage.targetPoints, convoyGarage.points + addedPoints);
    renderBag(player);
  }
  return addedPoints;
}

function useBagItem(player, idx) {
  const item = inventory[idx];
  if (!item || player.dead) return;

  if (item.type === 'weapon') {
    player.equippedWeapon = item.weaponId;
    renderBag(player);
    showToast(`Equipped ${item.name}`);
    return;
  }

  if (item.hunger) player.hunger = Math.min(player.maxHunger, player.hunger + item.hunger);
  if (item.hp) player.hp = Math.min(player.maxHp, player.hp + item.hp);
  inventory.splice(idx, 1);
  renderBag(player);
  showToast(`Used ${item.name}`);
}

function dropBagItem(player, idx) {
  const item = inventory[idx];
  if (!item || player.dead) return;

  if (item.type === 'weapon' && player.equippedWeapon === item.weaponId) {
    player.equippedWeapon = 'fists';
  }

  droppedLoot.push({
    ...item,
    x: player.x + (Math.random() - 0.5) * 0.4,
    y: player.y + (Math.random() - 0.5) * 0.4
  });
  inventory.splice(idx, 1);
  renderBag(player);
  showToast(`Dropped ${item.name}`);
}
