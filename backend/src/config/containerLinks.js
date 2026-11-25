// Maps Docker container names to the public URL shown as a link in the dashboard.
// Configure in backend/container-links.json (gitignored) — see container-links.example.json.
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '../../container-links.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[config] invalid container-links.json:', e.message);
    return {};
  }
}

module.exports = load();
