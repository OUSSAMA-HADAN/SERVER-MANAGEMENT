#!/usr/bin/env node
/**
 * Enroll (or remove) two-factor authentication for a ServerCtrl user.
 *   node setup-2fa.js            → enroll / re-enroll (shows a QR code to scan)
 *   node setup-2fa.js --disable  → remove 2FA from a user
 * Run it on the server itself — never through the web terminal of an untrusted session.
 */
require('dotenv').config();
const readline = require('readline');
const QRCode = require('qrcode');
const sequelize = require('./src/config/db');
const User = require('./src/models/User');
const totp = require('./src/services/totp');

const ask = (q) => new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, (a) => { rl.close(); resolve(a.trim()); });
});

async function main() {
  await User.migrate();
  await sequelize.sync();
  const users = await User.findAll();
  if (!users.length) { console.error('No users. Run: node setup.js'); process.exit(1); }
  console.log('Users:', users.map((u) => `${u.username}${u.totpSecret ? ' (2FA on)' : ''}`).join(', '));

  const name = users.length === 1 ? users[0].username : await ask('Username: ');
  const user = users.find((u) => u.username === name);
  if (!user) { console.error('No such user'); process.exit(1); }

  if (process.argv.includes('--disable')) {
    if ((await ask(`Remove 2FA from "${user.username}"? type YES: `)) !== 'YES') process.exit(1);
    user.totpSecret = null;
    await user.save();
    console.log('✓ 2FA removed.');
    process.exit(0);
  }

  const secret = totp.generateSecret();
  const url = totp.otpauthUrl(secret, user.username, `ServerCtrl ${process.env.SERVER_NAME || 'server'}`);
  console.log(`\nScan with Google Authenticator / Authy / Aegis / 2FAS for "${user.username}":\n`);
  console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
  console.log(`Can't scan? Enter this key manually: ${secret.match(/.{1,4}/g).join(' ')}\n`);

  for (let i = 0; i < 3; i++) {
    const code = (await ask('Enter the 6-digit code from the app to confirm: ')).replace(/\s+/g, '');
    if (totp.verify(secret, code) !== null) {
      user.totpSecret = secret;
      await user.save();
      await sequelize.query('DELETE FROM Sessions');
      console.log(`\n✓ 2FA enabled for "${user.username}". All sessions revoked — log in again.`);
      console.log('  If the server is running: sudo systemctl restart serverctrl\n');
      process.exit(0);
    }
    console.log('✗ Wrong code (check your phone clock is automatic).');
  }
  console.error('2FA NOT enabled.');
  process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
