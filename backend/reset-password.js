#!/usr/bin/env node
/**
 * Change the admin password and revoke ALL existing login sessions.
 * Usage: node reset-password.js
 * Does not touch any other data (unlike setup.js, which wipes the database).
 */
require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcrypt');
const sequelize = require('./src/config/db');
const User = require('./src/models/User');

function ask(q, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => { if (s.includes(q)) rl.output.write(s); };
    rl.question(q, (a) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a); });
  });
}

function strongEnough(pw) {
  if (pw.length < 14) return 'must be at least 14 characters';
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (classes < 3) return 'use at least 3 of: lowercase, uppercase, digits, symbols';
  return null;
}

async function main() {
  await User.migrate();
  await sequelize.sync();
  const users = await User.findAll();
  if (!users.length) { console.error('No users found. Run: node setup.js'); process.exit(1); }
  console.log('Users:', users.map((u) => u.username).join(', '));

  const username = (await ask('Username to reset: ')).trim();
  const user = users.find((u) => u.username === username);
  if (!user) { console.error('No such user'); process.exit(1); }

  const newUsername = (await ask(`New username (enter to keep "${username}"): `)).trim();
  const pw = await ask('New password: ', true);
  const problem = strongEnough(pw);
  if (problem) { console.error(`Password rejected: ${problem}`); process.exit(1); }
  const pw2 = await ask('Repeat password: ', true);
  if (pw !== pw2) { console.error('Passwords do not match'); process.exit(1); }

  user.passwordHash = await bcrypt.hash(pw, 12);
  if (newUsername) user.username = newUsername;
  await user.save();

  const [, meta] = await sequelize.query('DELETE FROM Sessions');
  console.log(`\n✓ Password updated for "${user.username}"`);
  console.log(`✓ All sessions revoked${meta?.changes !== undefined ? ` (${meta.changes})` : ''}`);
  console.log('Restart the service: sudo systemctl restart serverctrl\n');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
