import { execFileSync } from 'node:child_process';
import net from 'node:net';

// Free only the two documented demo ports. execFile avoids shell quoting issues on Windows.
for (const port of [3001, 8088]) {
  const available = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
  });
  if (available) continue;
  console.info(`Freeing demo port ${port}…`);
  if (process.platform === 'win32') {
    execFileSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$ErrorActionPreference = 'Stop'; Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Where-Object { $_.RemotePort -eq 0 -and $_.OwningProcess -gt 0 } | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }`,
    ]);
  } else {
    const pids = execFileSync('lsof', ['-tiTCP:' + port, '-sTCP:LISTEN'], {
      encoding: 'utf8',
    });
    for (const pid of new Set(pids.trim().split(/\s+/))) process.kill(Number(pid), 'SIGTERM');
  }
}
