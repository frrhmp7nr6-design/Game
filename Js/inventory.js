import { worldLoot } from './map.js';

export const BAG_CAPACITY = 6;
export const inventory = [];

let toastTimer = null;

export function showToast(msg) {
  const toastEl = document.getElementById('toast');
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
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

export function renderBag(player) {
  const bagCount = document.getElementById('bag-count');
  const bagSlotsLabel = document.getElementById('bag-slots-label');
  const bagList = document.getElementById('bag-list');

  bagCount.textContent = `${inventory.length}/${BAG_CAPACITY}`;
  bagSlotsLabel.textContent = `${inventory.length} / ${BAG_CAPACITY} Slots`;
  bagList.innerHTML = '';

  if (inventory.length === 0) {
    bagList.innerHTML = `<div style="color:#64748b; font-size:12px; text-align:center; padding:14px 0;">Bag is empty. Walk near supplies and tap GRAB.</div>`;
    return;
  }

  inventory.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'bag-item';

    let desc = '';
    if (item.type === 'food') desc = `+${item.hunger}% Fullness, +${item.hp}% HP`;
    else if (item.type === 'med') desc = `+${item.hp}% Health`;
    else desc = 'Building material';

    const canUse = item.type === 'food' || item.type === 'med';
    const useLabel = item.type === 'med' ? 'HEAL' : 'EAT';

    row.innerHTML = `
      <div class="bag-item-info">
        <span class="bag-item-name">${item.name}</span>
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
  renderBag(player);
  showToast(`Stashed ${item.name}`);
  return true;
}

function useBagItem(player, idx) {
  const item = inventory[idx];
  if (!item || player.dead) return;
  if (item.hunger) player.hunger = Math.min(player.maxHunger, player.hunger + item.hunger);
  if (item.hp) player.hp = Math.min(player.maxHp, player.hp + item.hp);
  inventory.splice(idx, 1);
  renderBag(player);
  showToast(`Used ${item.name}`);
}

function dropBagItem(player, idx) {
  const item = inventory[idx];
  if (!item || player.dead) return;
  worldLoot.push({
    ...item,
    x: player.x + (Math.random() - 0.5) * 0.4,
    y: player.y + (Math.random() - 0.5) * 0.4
  });
  inventory.splice(idx, 1);
  renderBag(player);
  showToast(`Dropped ${item.name}`);
}
