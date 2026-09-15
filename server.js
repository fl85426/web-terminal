'use strict';

// 本地部署：从项目根目录 .env 读取配置（PORT / ACCESS_TOKEN / SHELL / HOME）
require('dotenv').config();

// 独立 Web 终端后端：Express + express-ws + node-pty
// 依赖（express / express-ws / node-pty）复用 terminal/app 已编译的 node_modules，
// 通过 NODE_PATH 解析（见 package.json 的 start 脚本）。
const path = require('path');
const express = require('express');
const expressWs = require('express-ws');
const pty = require('@homebridge/node-pty-prebuilt-multiarch');

// 访问令牌：从 .env（dotenv）或环境变量 ACCESS_TOKEN 读取。
// 为空字符串时不校验（无密码模式）。
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || '';

const app = express();
expressWs(app);

// 静态前端（xterm.js 自包含在 public/vendor）
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 健康检查（供发布脚本探测）
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

// 告诉前端是否需要密码（决定要不要弹密码框）
app.get('/auth/required', (req, res) => {
  res.json({ required: ACCESS_TOKEN !== '' });
});

const shell = process.env.SHELL || 'bash';

app.ws('/ws', (ws, req) => {
  // 1) 令牌校验：从握手 URL 的 ?token= 读取
  let token = '';
  try {
    token = new URL(req.url, 'http://localhost').searchParams.get('token') || '';
  } catch (e) {
    token = '';
  }
  if (ACCESS_TOKEN && token !== ACCESS_TOKEN) {
    try {
      ws.close(4401, 'unauthorized');
    } catch (e) {
      /* ignore */
    }
    return;
  }

  // 2) 启动 pty
  let term;
  try {
    term = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: process.env.HOME || '/root',
      env: process.env,
    });
  } catch (err) {
    try {
      ws.send('\r\n\x1b[31m[无法启动 shell: ' + err.message + ']\x1b[0m\r\n');
      ws.close();
    } catch (e) {
      /* ignore */
    }
    return;
  }

  term.onData((data) => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(data);
      } catch (e) {
        /* ignore */
      }
    }
  });

  ws.on('message', (msg) => {
    let m = null;
    try {
      m = JSON.parse(msg);
    } catch (e) {
      m = null;
    }
    if (m && m.type === 'ping') return; // 应用层心跳，忽略
    if (m && m.type === 'resize') {
      try {
        term.resize(Number(m.cols), Number(m.rows));
      } catch (e) {
        /* ignore */
      }
      return;
    }
    const data = m && typeof m.data === 'string' ? m.data : msg.toString();
    term.write(data);
  });

  // 3) 心跳保活：定时发 ping，防止中间网关因空闲断开 WebSocket
  const heartbeat = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.ping();
      } catch (e) {
        /* ignore */
      }
    }
  }, 25000);

  ws.on('close', () => {
    clearInterval(heartbeat);
    try {
      term.kill();
    } catch (e) {
      /* ignore */
    }
  });
  // 传输层错误直接忽略，交给 close 清理，避免进程崩溃
  ws.on('error', () => {});
});

const port = parseInt(process.env.PORT, 10) || 3000;
app.listen(port, '0.0.0.0', () => {
  console.log(
    'Web terminal listening on 0.0.0.0:' +
      port +
      (ACCESS_TOKEN ? ' (token required)' : ' (no token)'),
  );
});

