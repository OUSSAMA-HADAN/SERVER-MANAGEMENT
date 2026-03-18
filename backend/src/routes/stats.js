const router = require('express').Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const { requireAuth } = require('../middleware/auth');

const execAsync = promisify(exec);

router.get('/', requireAuth, async (req, res) => {
  try {
    const [cpuOut, memOut, diskOut, uptimeOut] = await Promise.all([
      execAsync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"),
      execAsync("free -b | awk '/^Mem:/{print $2, $3, $4}'"),
      execAsync("df -B1 /dev/sdb2 /dev/sda3 /dev/sdb5 | awk 'NR>1{print $1, $2, $3, $4, $6}'"),
      execAsync("cat /proc/uptime | awk '{print $1}'"),
    ]);

    const cpu = parseFloat(cpuOut.stdout.trim());
    const [memTotal, memUsed, memFree] = memOut.stdout.trim().split(' ').map(Number);
    const uptime = parseFloat(uptimeOut.stdout.trim());
    const disks = diskOut.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const parts = line.trim().split(/\s+/);
      return { device: parts[0], total: Number(parts[1]), used: Number(parts[2]), free: Number(parts[3]), mount: parts[4] };
    });
    const main = disks.find((d) => d.mount === '/') || disks[0];
    res.json({ cpu, memTotal, memUsed, memFree, diskTotal: main.total, diskUsed: main.used, diskFree: main.free, uptime, disks });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
