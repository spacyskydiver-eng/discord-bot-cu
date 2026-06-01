const db = require('../db');

async function runVeteranCheck(client) {
  try {
    const configRes = await db.query(
      `SELECT guild_id, veteran_role_id, veteran_months FROM guild_config WHERE veteran_role_id IS NOT NULL`
    );

    for (const config of configRes.rows) {
      const guild = client.guilds.cache.get(config.guild_id);
      if (!guild) continue;

      const months = config.veteran_months || 6;
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);

      const role = guild.roles.cache.get(config.veteran_role_id);
      if (!role) continue;

      // Fetch all members — uses Discord's stored joinedAt which predates bot join
      const members = await guild.members.fetch();

      for (const [, member] of members) {
        if (member.user.bot) continue;
        if (!member.joinedAt) continue;

        const isVeteran = new Date(member.joinedAt) <= cutoff;
        const hasRole = member.roles.cache.has(role.id);

        if (isVeteran && !hasRole) {
          await member.roles.add(role).catch(() => {});
          console.log(`Veteran role given to ${member.user.username} (joined ${member.joinedAt.toDateString()})`);
        } else if (!isVeteran && hasRole) {
          // Remove if they somehow got it early
          await member.roles.remove(role).catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error('Veteran check error:', err.message);
  }
}

module.exports = runVeteranCheck;
