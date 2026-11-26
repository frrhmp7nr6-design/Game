import { worldLoot, radioTower } from './map.js';
import { WEAPONS } from './combat.js';

export const BAG_CAPACITY = 8;
export const inventory = [];

let toastTimer = null;

export function showToast(msg) {
  const toastEl = document.getElementById('toast');
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
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
  inventory.splice(idx, 1);
  renderBag(player);
  return true;
}

export function renderBag(player) {
  const bagCount = document.getElementById('bag-count');
  const bagSlotsLabel = document.getElementById('bag-slots-label');
  const bagList = document.getElementById('bag-list');

  bagCount.textContent = `${inventory.length}/${BAG_CAPACITY}`;
  bagSlotsLabel.textContent = `${inventory.length} / ${BAG_CAPACITY} Slots`;
  bagList.innerHTML = '';

  const eqName = WEAPONS[player.equippedWeapon]?.name || 'Fists';
  const eqBanner = document.createElement('div');
  eqBanner.style.cssText = 'font-size:11px; color:#38bdf8; font-weight:700; padding-bottom:4px;';
  eqBanner.textContent = `EQUIPPED: ${eqName.toUpperCase()}`;
  bagList.appendChild(eqBanner);

  if (inventory.length === 0) {
    bagList.insertAdjacentHTML(
      'beforeend',
      `<div style="color:#64748b; font-size:12px; text-align:center; padding:12px 0;">Bag is empty. Scavenge buildings for Radio Parts & supplies.</div>`
    );
    return;
  }

  inventory.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'bag-item';

    let desc = '';
    if (item.type === 'food') desc = `+${item.hunger}% Fullness, +${item.hp}% HP`;
    else if (item.type === 'med') desc = `+${item.hp}% Health`;
    else if (item.type === 'part') desc = 'Mission Item • Take to SE Radio Tower';
    else if (item.type === 'tool') desc = 'Opens locked doors silently';
    else if (item.type === 'weapon') {
      const w = WEAPONS[item.weaponId];
      desc = `${w.damage} DMG • ${w.type === 'ranged' ? 'Ranged' : 'Melee'}`;
    }

    const isEquipped = item.type === 'weapon' && player.equippedWeapon === item.weaponId;
    const canUse = item.type === 'food' || item.type === 'med' || (item.type === 'weapon' && !isEquipped);
    const useLabel = item.type === 'med' ? 'HEAL' : item.type === 'weapon' ? 'EQUIP' : 'EAT';

    row.innerHTML = `
      <div class="bag-item-info">
        <span class="bag-item-name" style="${item.type === 'part' ? 'color:#22d3ee;' : item.type === 'tool' ? 'color:#fbbf24;' : ''}">${item.name} ${isEquipped ? '<span style="color:#38bdf8;font-size:10px;">(ACTIVE)</span>' : ''}</span>
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

export function grabLootAt(player, lootIndex) {
  if (lootIndex === -1 || player.dead) return false;
  if (inventory.length >= BAG_CAPACITY) {
    showToast('Backpack is full!');
    return false;
  }
  const item = worldLoot[lootIndex];
  inventory.push(item);
  worldLoot.splice(lootIndex, 1);

  if (item.type === 'part') {
    showToast(`📡 Found Radio Part: ${item.name}!`);
  } else if (item.type === 'weapon' && player.equippedWeapon === 'fists') {
    player.equippedWeapon = item.weaponId;
    showToast(`Equipped ${item.name}`);
  } else {
    showToast(`Stashed ${item.name}`);
  }

  renderBag(player);
  return true;
}

export function installRadioPartsFromBag(player) {
  let installedCount = 0;
  for (let i = inventory.length - 1; i >= 0; i--) {
    if (inventory[i].type === 'part') {
      radioTower.installedParts.push(inventory[i].name);
      inventory.splice(i, 1);
      installedCount++;
    }
  }
  if (installedCount > 0) {
    renderBag(player);
  }
  return installedCount;
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

  worldLoot.push({
    ...item,
    x: player.x + (Math.random() - 0.5) * 0.4,
    y: player.y + (Math.random() - 0.5) * 0.4
  });
  inventory.splice(idx, 1);
  renderBag(player);
  showToast(`Dropped ${item.name}`);
}
