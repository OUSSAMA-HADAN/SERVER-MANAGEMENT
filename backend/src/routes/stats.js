const router = require('express').Router();
const { exec } = require('child_process');
const { promisify } = require('util');
const { requireAuth } = require('../middleware/auth');

const execAsync = promisify(exec);

router.get('/', requireAuth, async (req, res) => {
  try {
    const [cpuOut, memOut, diskOut, uptimeOut, tempOut] = await Promise.all([
      execAsync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}'"),
      execAsync("free -b | awk '/^Mem:/{print $2, $3, $4}'"),
      execAsync("df -B1 /dev/sda1 | awk 'NR>1{print $1, $2, $3, $4, $6}'"),
      execAsync("cat /proc/uptime | awk '{print $1}'"),
      execAsync("cat /sys/class/thermal/thermal_zone*/temp 2>/dev/null | head -1").catch(() => ({ stdout: '0' })),
    ]);

    const cpu = parseFloat(cpuOut.stdout.trim());
    const [memTotal, memUsed, memFree] = memOut.stdout.trim().split(' ').map(Number);
    const uptime = parseFloat(uptimeOut.stdout.trim());
    const tempMilliC = parseInt(tempOut.stdout.trim()) || 0;
    const temp = Math.round(tempMilliC / 1000);
    const disks = diskOut.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const parts = line.trim().split(/\s+/);
      return { device: parts[0], total: Number(parts[1]), used: Number(parts[2]), free: Number(parts[3]), mount: parts[4] };
    });
    const main = disks.find((d) => d.mount === '/') || disks[0];
    const response = { cpu, memTotal, memUsed, memFree, diskTotal: main.total, diskUsed: main.used, diskFree: main.free, uptime, temp, disks };
    console.log('[STATS] Returning temp:', temp, 'from tempMilliC:', tempMilliC);
    res.json(response);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
