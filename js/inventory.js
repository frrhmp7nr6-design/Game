import { convoyGarage, campUpgrades } from './map.js';
import { lootedIds, droppedLoot } from './chunks.js';
import { WEAPONS } from './combat.js';

export const inventory = [];
let toastTimer = null;

export function showToast(msg) {
  const toastEl = document.getElementById('toast');
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

export function applyArchetypeLoadout(player, arch) {
  player.archetype = arch;
  player.carryingCrate = null;
  player.scrap = 2;
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

export function openCraftingBench(player) {
  const modal = document.getElementById('craft-modal');
  const grid = document.getElementById('craft-grid');
  const resLabel = document.getElementById('craft-resources');

  const recipes = [
    {
      id: 'craft-bandage',
      title: '🩹 Field Bandage (2 Scrap)',
      sub: 'Restores +45 HP on demand',
      cost: 2,
      action: () => {
        if (inventory.length >= player.bagCapacity) return showToast('Bag full!');
        inventory.push({ id: `med-${Date.now()}`, name: 'Field Bandage', type: 'med', hp: 45, color: '#f8fafc' });
        return true;
      }
    },
    {
      id: 'craft-mre',
      title: '🥫 Trail MRE Pack (2 Scrap)',
      sub: 'Restores +55% Fullness & +10 HP',
      cost: 2,
      action: () => {
        if (inventory.length >= player.bagCapacity) return showToast('Bag full!');
        inventory.push({ id: `mre-${Date.now()}`, name: 'Trail MRE Pack', type: 'food', hunger: 55, hp: 10, color: '#eab308' });
        return true;
      }
    },
    {
      id: 'craft-axe',
      title: '🪓 Forged Fire Axe (5 Scrap)',
      sub: '58 Melee DMG • Heavy Cleave',
      cost: 5,
      action: () => {
        if (inventory.length >= player.bagCapacity) return showToast('Bag full!');
        inventory.push({ id: `axe-${Date.now()}`, name: 'Fire Axe', type: 'weapon', weaponId: 'axe', color: '#f43f5e' });
        player.equippedWeapon = 'axe';
        return true;
      }
    },
    {
      id: 'craft-pistol',
      title: '🔫 Tactical 9mm Pistol (6 Scrap)',
      sub: '50 Ranged DMG • 7.8 Tile Reach',
      cost: 6,
      action: () => {
        if (inventory.length >= player.bagCapacity) return showToast('Bag full!');
        inventory.push({ id: `pis-${Date.now()}`, name: '9mm Pistol', type: 'weapon', weaponId: 'pistol', color: '#94a3b8' });
        player.equippedWeapon = 'pistol';
        return true;
      }
    },
    {
      id: 'upg-armory',
      title: campUpgrades.armory ? '✅ Quarry Armory (BUILT)' : '⚔️ Upgrade Armory (8 Scrap)',
      sub: '+20% All Weapon Damage permanently',
      cost: 8,
      disabled: campUpgrades.armory,
      action: () => {
        campUpgrades.armory = true;
        return true;
      }
    },
    {
      id: 'upg-medtent',
      title: campUpgrades.medicTent ? '✅ Field Med Tent (BUILT)' : '🏥 Upgrade Med Tent (8 Scrap)',
      sub: '2× Quarry Campfire healing speed & +20 Max HP',
      cost: 8,
      disabled: campUpgrades.medicTent,
      action: () => {
        campUpgrades.medicTent = true;
        player.maxHp += 20;
        player.hp = Math.min(player.maxHp, player.hp + 20);
        return true;
      }
    }
  ];

  resLabel.textContent = `Scrap Credits: ${player.scrap || 0} ⚙️ • Rescued Specialists: ${convoyGarage.specialists}`;
  grid.innerHTML = '';

  recipes.forEach((r) => {
    const btn = document.createElement('button');
    btn.className = 'arch-btn';
    if (r.disabled) btn.style.opacity = '0.55';
    btn.innerHTML = `<span class="arch-title">${r.title}</span><span class="arch-sub">${r.sub}</span>`;
    btn.addEventListener('click', () => {
      if (r.disabled) return;
      if ((player.scrap || 0) < r.cost) {
        showToast(`Need ${r.cost} Scrap Credits (kill zombies or load Convoy)!`);
        return;
      }
      if (r.action() === true) {
        player.scrap -= r.cost;
        renderBag(player);
        showToast(`Crafted: ${r.title.replace(/\s*\(\d+ Scrap\)/, '')}`);
        openCraftingBench(player);
      }
    });
    grid.appendChild(btn);
  });

  modal.classList.add('open');
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

  if (item.type === 'heavy') {
    if (player.carryingCrate) {
      showToast('Already hauling a Heavy Supply Crate!');
      return false;
    }
    removeFromWorld(item, activeChunks);
    player.carryingCrate = item;
    showToast(`📦 Hauling ${item.name}! (+${item.value} Convoy pts)`);
    return true;
  }

  const cap = player.bagCapacity || 8;
  if (inventory.length >= cap) {
    showToast('Backpack is full!');
    return false;
  }

  inventory.push(item);
  removeFromWorld(item, activeChunks);

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

export function dropHeavyCrate(player) {
  if (!player.carryingCrate) return false;
  const crate = player.carryingCrate;
  player.carryingCrate = null;
  droppedLoot.push({
    ...crate,
    x: player.x + (Math.random() - 0.5) * 0.4,
    y: player.y + (Math.random() - 0.5) * 0.4
  });
  showToast(`Dropped ${crate.name}`);
  return true;
}

function removeFromWorld(item, activeChunks) {
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
}

export function deliverConvoySupplies(player) {
  let addedPoints = 0;

  if (player.carryingCrate) {
    addedPoints += player.carryingCrate.value || 4;
    player.carryingCrate = null;
  }

  for (let i = inventory.length - 1; i >= 0; i--) {
    if (inventory[i].type === 'convoy') {
      addedPoints += inventory[i].value || 1;
      inventory.splice(i, 1);
    }
  }

  if (addedPoints > 0) {
    const engineerBonus = convoyGarage.specialists > 0 ? 1 : 0;
    const totalAdded = addedPoints + engineerBonus;
    convoyGarage.points = Math.min(convoyGarage.targetPoints, convoyGarage.points + totalAdded);
    // Reward Scrap Credits for every delivery
    player.scrap = (player.scrap || 0) + totalAdded * 2;
    renderBag(player);
    return totalAdded;
  }
  return 0;
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
