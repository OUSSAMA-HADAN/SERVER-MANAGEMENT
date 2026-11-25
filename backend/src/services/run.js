/** Run a binary without a shell (no quoting / injection pitfalls), with a timeout. */
const { execFile } = require('child_process');

function run(cmd, args = [], { timeout = 15000, maxBuffer = 4 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer, env: { ...process.env, LC_ALL: 'C' } }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        err.userMessage = (stderr || '').trim().split('\n').pop() || err.message;
        return reject(err);
      }
      resolve({ stdout, stderr });
    });
  });
}

/** Human-readable error for a failed privileged command. */
function sudoHint(err) {
  const msg = (err.stderr || err.message || '').toLowerCase();
  if (msg.includes('password') || msg.includes('sudo')) {
    return 'Permission denied: the panel user needs a passwordless sudoers rule for this command.';
  }
  return err.userMessage || 'Command failed';
}

module.exports = { run, sudoHint };
