import { convoyGarage, campUpgrades, rescueEvent } from './map.js';
import { droppedLoot } from './chunks.js';

export const inventory = [];

const bagModal = document.getElementById('bag-modal');
const bagList = document.getElementById('bag-list');
const bagBtn = document.getElementById('bag-btn');
const craftModal = document.getElementById('craft-modal');
const craftList = document.getElementById('craft-list');
const toastEl = document.getElementById('toast');

let toastTimer = null;
export function showToast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

export function updateBagHud(player) {
  if (!bagBtn) return;
  const cap = player?.bagCapacity || 8;
  const isOpen = bagModal && bagModal.classList.contains('open');
  bagBtn.textContent = isOpen ? `✕ CLOSE BAG` : `🎒 BAG (${inventory.length}/${cap})`;
}

export function applyArchetypeLoadout(player, archetype) {
  player.archetype = archetype;
  inventory.length = 0;

  if (archetype === 'bruiser') {
    player.maxHp = 140;
    player.hp = 140;
    player.bagCapacity = 8;
    inventory.push({ name: 'Crowbar', type: 'weapon', weaponId: 'crowbar', color: '#38bdf8' });
    player.equippedWeapon = 'crowbar';
  } else if (archetype === 'medic') {
    player.maxHp = 105;
    player.hp = 105;
    player.bagCapacity = 8;
    inventory.push({ name: 'Bandage', type: 'med', hunger: 0, hp: 40, color: '#f8fafc' });
    inventory.push({ name: 'Bandage', type: 'med', hunger: 0, hp: 40, color: '#f8fafc' });
    player.equippedWeapon = 'fists';
  } else if (archetype === 'scavenger') {
    player.maxHp = 100;
    player.hp = 100;
    player.bagCapacity = 10;
    inventory.push({ name: 'Master Lockpick', type: 'tool', toolId: 'lockpick', infinite: true, color: '#fbbf24' });
    player.equippedWeapon = 'fists';
  } else if (archetype === 'marksman') {
    player.maxHp = 95;
    player.hp = 95;
    player.bagCapacity = 8;
    inventory.push({ name: '9mm Pistol', type: 'weapon', weaponId: 'pistol', color: '#94a3b8' });
    player.equippedWeapon = 'pistol';
  }

  updateBagHud(player);
}

export function hasLockpick() {
  return inventory.some((item) => item.toolId === 'lockpick');
}

export function consumeLockpick(player) {
  const idx = inventory.findIndex((item) => item.toolId === 'lockpick');
  if (idx === -1) return false;
  if (!inventory[idx].infinite) {
    inventory.splice(idx, 1);
    updateBagHud(player);
  }
  return true;
}

export function hasPoliceRadio() {
  return inventory.some((item) => item.type === 'radio');
}

export function scanPoliceRadio(player) {
  const radio = inventory.find((item) => item.type === 'radio');
  if (!radio) {
    showToast('Need a Police Radio from Downtown PD (1125, 916)!');
    return false;
  }
  if (!rescueEvent.active || rescueEvent.following) {
    showToast('No active distress frequency right now.');
    return false;
  }

  rescueEvent.radioPingTimer = 28;
  showToast(`📻 ${rescueEvent.name}: ${rescueEvent.callout}`);
  return true;
}

export function grabLootItem(player, targetItem, activeChunks) {
  if (!targetItem) return false;

  const removeFromWorld = () => {
    const dIdx = droppedLoot.indexOf(targetItem);
    if (dIdx !== -1) {
      droppedLoot.splice(dIdx, 1);
      return;
    }
    for (const c of activeChunks) {
      const idx = c.loot.indexOf(targetItem);
      if (idx !== -1) {
        c.loot.splice(idx, 1);
        return;
      }
    }
  };

  if (targetItem.type === 'heavy') {
    if (player.carryingCrate) {
      showToast('Already hauling a Heavy Crate!');
      return false;
    }
    removeFromWorld();
    player.carryingCrate = targetItem;
    showToast(`📦 Hoisted ${targetItem.name}! Carry it back to the Quarry Garage!`);
    return true;
  }

  if (inventory.length >= player.bagCapacity) {
    showToast('Backpack full! Use or drop an item first.');
    return false;
  }

  removeFromWorld();
  inventory.push(targetItem);
  if (targetItem.type === 'weapon' && player.equippedWeapon === 'fists') {
    player.equippedWeapon = targetItem.weaponId;
  }
  updateBagHud(player);
  showToast(`Picked up ${targetItem.name}`);
  return true;
}

export function dropHeavyCrate(player) {
  if (!player.carryingCrate) return;
  const crate = player.carryingCrate;
  crate.x = player.x;
  crate.y = player.y;
  droppedLoot.push(crate);
  player.carryingCrate = null;
  showToast(`Dropped ${crate.name}`);
}

export function deliverConvoySupplies(player) {
  let delivered = 0;

  for (let i = inventory.length - 1; i >= 0; i--) {
    if (inventory[i].type === 'convoy') {
      delivered += inventory[i].value || 1;
      inventory.splice(i, 1);
    }
  }

  if (player.carryingCrate) {
    delivered += player.carryingCrate.value || 4;
    player.carryingCrate = null;
  }

  if (delivered > 0) {
    const bonus = convoyGarage.specialists > 0 ? 1 : 0;
    const total = delivered + bonus;
    convoyGarage.points = Math.min(convoyGarage.targetPoints, convoyGarage.points + total);
    player.scrap = (player.scrap || 0) + total * 2;
    updateBagHud(player);
  }

  return delivered;
}

export function initInventory(player) {
  const closeBag = () => {
    if (!bagModal) return;
    bagModal.classList.remove('open');
    updateBagHud(player);
  };

  const renderBagList = () => {
    if (!bagList) return;
    bagList.innerHTML = '';

    // Top header row with prominent Close button so players can always exit the bag cleanly
    const headerRow = document.createElement('div');
    headerRow.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #334155;';
    headerRow.innerHTML = `
      <span style="font-weight:800;font-size:13px;color:#38bdf8;">🎒 BACKPACK (${inventory.length}/${player.bagCapacity})</span>
      <button id="bag-inner-close" style="background:#ef4444;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-weight:800;font-size:12px;cursor:pointer;">✕ CLOSE</button>
    `;
    headerRow.querySelector('#bag-inner-close').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeBag();
    });
    bagList.appendChild(headerRow);

    if (inventory.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#94a3b8;font-size:13px;padding:12px 0;text-align:center;';
      empty.textContent = 'Your backpack is empty.';
      bagList.appendChild(empty);
      return;
    }

    inventory.forEach((item, idx) => {
      const row = document.createElement('div');
      row.className = 'bag-item';

      const isEquipped = item.type === 'weapon' && player.equippedWeapon === item.weaponId;
      const actionLabel =
        item.type === 'weapon'
          ? isEquipped
            ? 'EQUIPPED'
            : 'EQUIP'
          : item.type === 'food' || item.type === 'med'
          ? 'USE'
          : item.type === 'radio'
          ? 'SCAN'
          : 'DROP';

      row.innerHTML = `
        <div>
          <div style="font-weight:700;color:#f8fafc;">${item.name}</div>
          <div style="font-size:11px;color:#94a3b8;">${item.type.toUpperCase()}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="use-btn" style="background:${isEquipped ? '#16a34a' : '#0284c7'};">${actionLabel}</button>
          <button class="drop-btn" style="background:#475569;">DROP</button>
        </div>
      `;

      row.querySelector('.use-btn').addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (item.type === 'weapon') {
          player.equippedWeapon = item.weaponId;
          showToast(`Equipped ${item.name}`);
          renderBagList();
        } else if (item.type === 'food' || item.type === 'med') {
          player.hp = Math.min(player.maxHp, player.hp + (item.hp || 0));
          player.hunger = Math.min(player.maxHunger, player.hunger + (item.hunger || 0));
          inventory.splice(idx, 1);
          updateBagHud(player);
          showToast(`Used ${item.name}`);
          renderBagList();
        } else if (item.type === 'radio') {
          closeBag();
          scanPoliceRadio(player);
        } else {
          const dropped = inventory.splice(idx, 1)[0];
          dropped.x = player.x;
          dropped.y = player.y;
          droppedLoot.push(dropped);
          updateBagHud(player);
          renderBagList();
        }
      });

      row.querySelector('.drop-btn').addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dropped = inventory.splice(idx, 1)[0];
        if (dropped.type === 'weapon' && player.equippedWeapon === dropped.weaponId) {
          player.equippedWeapon = 'fists';
        }
        dropped.x = player.x;
        dropped.y = player.y;
        droppedLoot.push(dropped);
        updateBagHud(player);
        showToast(`Dropped ${dropped.name}`);
        renderBagList();
      });

      bagList.appendChild(row);
    });
  };

  // Tapping outside the bag card on the dark backdrop closes the bag immediately
  if (bagModal) {
    bagModal.addEventListener('pointerdown', (e) => {
      if (e.target === bagModal) {
        e.preventDefault();
        closeBag();
      }
    });
  }

  const toggleBag = () => {
    if (!bagModal) return;
    const willOpen = !bagModal.classList.contains('open');
    if (willOpen) {
      bagModal.classList.add('open');
      renderBagList();
    } else {
      bagModal.classList.remove('open');
    }
    updateBagHud(player);
  };

  return { toggleBag, closeBag };
}

export function openCraftingBench(player) {
  if (!craftModal || !craftList) return;
  craftModal.classList.add('open');
  craftList.innerHTML = '';

  const recipes = [
    {
      name: 'Bandage (+40 HP)',
      cost: 2,
      desc: 'Craft sterile field dressing',
      make: () => inventory.push({ name: 'Bandage', type: 'med', hunger: 0, hp: 40, color: '#f8fafc' })
    },
    {
      name: 'Lockpick Set',
      cost: 3,
      desc: 'Open locked doors silently',
      make: () => inventory.push({ name: 'Lockpick Set', type: 'tool', toolId: 'lockpick', color: '#fbbf24' })
    },
    {
      name: 'Fire Axe',
      cost: 6,
      desc: 'Heavy melee & barricade breacher',
      make: () => {
        inventory.push({ name: 'Fire Axe', type: 'weapon', weaponId: 'axe', color: '#ef4444' });
        player.equippedWeapon = 'axe';
      }
    },
    {
      name: 'Quarry Medic Tent',
      cost: 8,
      desc: 'Doubles campfire healing speed',
      disabled: campUpgrades.medicTent,
      make: () => {
        campUpgrades.medicTent = true;
      }
    }
  ];

  recipes.forEach((rec) => {
    const row = document.createElement('div');
    row.className = 'bag-item';
    row.innerHTML = `
      <div>
        <div style="font-weight:700;color:#f8fafc;">${rec.name}</div>
        <div style="font-size:11px;color:#94a3b8;">${rec.desc} • ⚙️ ${rec.cost} Scrap</div>
      </div>
      <button class="use-btn" ${rec.disabled ? 'disabled' : ''}>${rec.disabled ? 'BUILT' : 'CRAFT'}</button>
    `;
    row.querySelector('.use-btn').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (rec.disabled) return;
      if ((player.scrap || 0) < rec.cost) {
        showToast(`Need ${rec.cost} Scrap!`);
        return;
      }
      if (inventory.length >= player.bagCapacity && !rec.name.includes('Tent')) {
        showToast('Backpack full!');
        return;
      }
      player.scrap -= rec.cost;
      rec.make();
      updateBagHud(player);
      showToast(`Crafted ${rec.name}!`);
      openCraftingBench(player);
    });
    craftList.appendChild(row);
  });
}
