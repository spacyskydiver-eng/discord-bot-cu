let guildId = '';
let password = '';

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function setStatus(el, msg, ok) {
  el.textContent = msg;
  el.className = `status ${ok ? 'success' : 'fail'}`;
  show(el);
  setTimeout(() => hide(el), 4000);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guild_id: guildId, password, ...body })
  });
  return res.json();
}

// Login
document.getElementById('login-btn').addEventListener('click', async () => {
  guildId = document.getElementById('guild-id').value.trim();
  password = document.getElementById('password').value;
  const errEl = document.getElementById('login-error');

  if (!guildId) { errEl.textContent = 'Enter your Server ID.'; show(errEl); return; }

  const data = await api('/api/config');
  if (data.error) { errEl.textContent = data.error; show(errEl); return; }

  hide(errEl);
  hide(document.getElementById('login-section'));
  show(document.getElementById('dashboard'));
  loadConfig(data);
  loadLeaderboard();
});

function loadConfig(data) {
  document.getElementById('xp-per-message').value = data.config.xp_per_message;
  document.getElementById('xp-cooldown').value = data.config.xp_cooldown_seconds;
  document.getElementById('level-up-channel').value = data.config.level_up_channel_id || '';
  renderLevels(data.levels);
}

// Save XP settings
document.getElementById('save-xp-btn').addEventListener('click', async () => {
  const status = document.getElementById('xp-status');
  const res = await api('/api/config/xp', {
    xp_per_message: parseInt(document.getElementById('xp-per-message').value),
    xp_cooldown_seconds: parseInt(document.getElementById('xp-cooldown').value),
    level_up_channel_id: document.getElementById('level-up-channel').value.trim() || null
  });
  setStatus(status, res.ok ? 'Saved!' : res.error, !!res.ok);
});

// Levels
function renderLevels(levels) {
  const container = document.getElementById('levels-container');
  container.innerHTML = `
    <div class="level-row-header">
      <span>Level #</span><span>Name</span><span>XP Required</span><span></span>
    </div>
  `;
  for (const lv of levels) addLevelRow(lv.level_number, lv.level_name, lv.xp_required);
}

function addLevelRow(num = '', name = '', xp = '') {
  const container = document.getElementById('levels-container');
  const row = document.createElement('div');
  row.className = 'level-row';
  row.innerHTML = `
    <input type="number" class="lv-num" value="${num}" min="1" placeholder="#" />
    <input type="text" class="lv-name" value="${name}" placeholder="e.g. Knight" />
    <input type="number" class="lv-xp" value="${xp}" min="0" placeholder="XP" />
    <button class="remove-btn" title="Remove">✕</button>
  `;
  row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

document.getElementById('add-level-btn').addEventListener('click', () => addLevelRow());

document.getElementById('save-levels-btn').addEventListener('click', async () => {
  const status = document.getElementById('levels-status');
  const rows = document.querySelectorAll('.level-row');
  const levels = [];
  for (const row of rows) {
    const num = parseInt(row.querySelector('.lv-num').value);
    const name = row.querySelector('.lv-name').value.trim();
    const xp = parseInt(row.querySelector('.lv-xp').value);
    if (!num || !name || isNaN(xp)) { setStatus(status, 'Fill in all fields for every level.', false); return; }
    levels.push({ level_number: num, level_name: name, xp_required: xp });
  }
  const res = await api('/api/config/levels', { levels });
  setStatus(status, res.ok ? 'Levels saved!' : res.error, !!res.ok);
});

// Change password
document.getElementById('change-pw-btn').addEventListener('click', async () => {
  const status = document.getElementById('pw-status');
  const newPw = document.getElementById('new-password').value;
  const res = await api('/api/config/password', { new_password: newPw });
  if (res.ok) { password = newPw; }
  setStatus(status, res.ok ? 'Password changed!' : res.error, !!res.ok);
});

// Leaderboard
async function loadLeaderboard() {
  const container = document.getElementById('leaderboard-container');
  const res = await fetch(`/api/leaderboard?guild_id=${guildId}`);
  const rows = await res.json();
  if (!rows.length) { container.innerHTML = '<p class="hint">No activity yet.</p>'; return; }
  container.innerHTML = rows.map((r, i) => `
    <div class="lb-row">
      <span class="lb-rank">#${i + 1}</span>
      <span>${r.discord_id}</span>
      <span>Lv ${r.level}</span>
      <span class="lb-xp">${r.xp.toLocaleString()} XP</span>
    </div>
  `).join('');
}
