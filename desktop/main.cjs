const { app, BrowserWindow, dialog } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const distPath = path.join(app.getAppPath(), 'dist');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

let server;

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer((request, response) => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405).end();
        return;
      }

      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      } catch {
        response.writeHead(400).end();
        return;
      }

      const relativePath = pathname.replace(/^[/\\]+/, '') || 'index.html';
      const filePath = path.resolve(distPath, relativePath);
      if (!filePath.startsWith(`${distPath}${path.sep}`)) {
        response.writeHead(403).end();
        return;
      }

      fs.readFile(filePath, (error, contents) => {
        if (error) {
          response.writeHead(404).end();
          return;
        }
        response.writeHead(200, {
          'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-store'
        });
        response.end(request.method === 'HEAD' ? undefined : contents);
      });
    });

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function launch() {
  const port = await startServer();
  const origin = `http://127.0.0.1:${port}`;
  const window = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    autoHideMenuBar: true,
    show: false,
    backgroundColor: '#edf3e9',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(origin)) event.preventDefault();
  });
  window.once('ready-to-show', () => window.show());
  await window.loadURL(`${origin}/`);
}

app.whenReady().then(launch).catch((error) => {
  dialog.showErrorBox('雨落校园启动失败', error.message);
  app.quit();
});

app.on('window-all-closed', () => {
  server?.close();
  app.quit();
});

app.on('before-quit', () => server?.close());
