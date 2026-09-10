require('dotenv').config();
const db = require('./db');
const { sendDiscordDM } = require('./server/discord-dm');

const SITE = 'https://cuevents.xyz';
const DELAY_MS = 1200;
// Wave 2 was sent on Sep 9 2026 at ~20:51 BST — target only players accepted after that
const WAVE2_CUTOFF = '2026-09-09 21:00:00+01:00';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  // Ensure dm_wave tracking column exists
  await db.query(`ALTER TABLE hundred_applications ADD COLUMN IF NOT EXISTS dm_wave INT`);

  // Players accepted after wave 2 who haven't been DM'd yet
  const res = await db.query(`
    SELECT discord_id, discord_tag FROM hundred_applications
    WHERE status = 'accepted'
      AND ign IS NOT NULL AND ign != ''
      AND dm_wave IS NULL
      AND accepted_at > $1
    ORDER BY accepted_at ASC
  `, [WAVE2_CUTOFF]);

  console.log(`New players to DM (wave 3): ${res.rows.length}\n`);

  if (!res.rows.length) {
    console.log('No new players to contact. All caught up.');
    process.exit(0);
  }

  let sent = 0, failed = 0;

  for (const p of res.rows) {
    const msg =
      '**150 Player Event — Verify Your Account**\n\n' +
      'Hey! You\'ve been accepted into the 150 Player Event. Before you can play, you need to verify your Minecraft username.\n\n' +
      '**Step 1 — Confirm your Minecraft username:**\n' +
      SITE + '/150-verify-ign?uid=' + p.discord_id + '\n\n' +
      '**Step 2 — Check the Nation Map:**\n' +
      'See where all nations have placed their pins on the world map:\n' +
      SITE + '/map\n\n' +
      'If you have any questions, reach out to a staff member.';

    try {
      await sendDiscordDM(p.discord_id, msg);
      await db.query(`UPDATE hundred_applications SET dm_wave = 3 WHERE discord_id = $1`, [p.discord_id]);
      sent++;
      console.log(`[${sent + failed}/${res.rows.length}] OK  ${p.discord_tag}`);
    } catch (err) {
      failed++;
      console.log(`[${sent + failed}/${res.rows.length}] ERR ${p.discord_tag} — ${err.message}`);
    }
    await sleep(DELAY_MS);
  }

  console.log(`\nDone. Sent: ${sent}, Failed: ${failed}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
