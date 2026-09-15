# Web Terminal（WebSSH）

一个独立运行的浏览器终端：后端基于 Node.js + Express + express-ws + node-pty，前端使用 xterm.js（依赖本地自包含，无需外网 CDN）。在浏览器中打开即可访问远端 shell，支持访问密码（token）保护和 WebSocket 心跳保活。

> 本机部署记录：Windows + Node v22.18.0。node-pty 采用预编译 fork（无需 MSVC 构建工具），运行配置集中在 .env。

## 功能特性

- 浏览器内独立终端（xterm.js），支持窗口尺寸自适应、终端链接点击跳转
- 访问密码校验：未授权连接在 WebSocket 握手阶段被拒绝（4401）
- WebSocket 心跳保活 + 前端断线自动重连，避免空闲时被网关断开
- 前端资源本地自包含，部署无需访问公网
- 配置集中管理：项目根目录 .env（dotenv 启动时自动加载），改密码 / 端口无需改代码
- Windows 原生部署：node-pty 使用预编译 fork，无需 Visual Studio / MSVC / WSL

## 目录结构

```
web-terminal/
|-- server.js                 # 后端：Express + express-ws + node-pty（require 已指向预编译 fork）
|-- package.json              # 当前运行配置（Windows 通用部署版）
|-- package.portable.json     # Linux/macOS 通用部署模板（node-pty 需本地编译）
|-- package.sandbox.json.bak  # 原沙箱环境 package.json 备份（NODE_PATH 复用版）
|-- .env                      # 运行配置：PORT / ACCESS_TOKEN / SHELL / HOME（dotenv 自动加载）
|-- .gitignore                # 忽略 .env、node_modules、运行日志
|-- server.out.log / .err.log # 后台运行日志
|-- README.md
+-- public/
    |-- index.html            # 前端：xterm.js 终端 + 密码框 + 自动重连
    +-- vendor/               # xterm.js 及其插件（本地静态资源）
```

## 环境要求

| 项目 | 要求 | 备注 |
|------|------|------|
| Node.js | 22.x（本机 v22.18.0 验证） | node-pty 是原生模块，与 Node ABI 绑定；预编译 fork 覆盖 Node 20+ |
| 操作系统 | Linux / macOS / Windows | Windows 原生即可运行：node-pty 用预编译 fork，shell 用 Git Bash |
| 构建工具 | 仅 Linux/macOS 源码编译需要 | Windows 走预编译下载，无需 python3 / make / g++ / MSVC |
| Shell | 任意可用 shell | 由 .env 或环境变量 SHELL 指定；Windows 建议 Git Bash 的 bash.exe |

## 配置信息（.env）

配置集中在项目根目录的 .env 文件（dotenv 在启动时自动加载，日志会打印 injected env (N) 确认注入数量）；也兼容传统的启动命令环境变量注入方式。

```
PORT=3000
ACCESS_TOKEN=你的访问密码
SHELL=C:\Program Files\Git\bin\bash.exe
HOME=C:\Users\你的用户名
```

| 变量 | 说明 | 默认值 |
|------|------|--------|
| ACCESS_TOKEN | 访问密码；为空则关闭密码保护（任何人可直连，不建议） | 空 |
| PORT | 监听端口 | 3000 |
| SHELL | 终端启动的 shell 路径；Windows 需指向实际存在的 bash.exe 或 pwsh.exe | bash |
| HOME | 终端启动目录（cwd）；Windows 需指向存在的目录 | /root |

**修改访问密码：编辑 .env 中的 ACCESS_TOKEN 一行，重启服务生效，无需改任何代码文件。**

> 密码校验发生在 WebSocket 握手（服务端 close 4401）；首页 HTML 本身不做校验，输入密码后由前端发起带 token 的 WS 连接。token 经 URL 编码传递，支持特殊字符。

## 安装部署

### 方式一：Windows 原生部署（本机已采用）

1. 依赖：package.json 中以 @homebridge/node-pty-prebuilt-multiarch 替代 node-pty（API 完全兼容，仅 require 名称不同），server.js 的 require 同步替换。
2. 安装依赖（自动从 GitHub Releases 下载 win-x64 预编译二进制，全程无需 MSVC / Visual Studio）：

```
npm install
```

   若 npm 报 Could not determine Node.js install directory（PowerShell 下 npm.ps1 的问题），改用 npm.cmd 或完整路径 C:\Program Files\nodejs\npm.cmd。
3. 按上文配置 .env。
4. 启动：

```
node server.js   # 前台运行，便于观察日志
Start-Process node -ArgumentList server.js -WorkingDirectory D:\src\web-terminal -WindowStyle Hidden -RedirectStandardOutput server.out.log -RedirectStandardError server.err.log   # 后台运行
```

5. 浏览器访问 http://127.0.0.1:3000，输入 .env 中的密码即可使用。

### 方式二：Linux / macOS 通用部署

```
cp package.portable.json package.json   # 或保留当前 package.json（含预编译 fork，同样免编译）
npm install
npm start
```

若使用官方 node-pty（源码编译），需要 python3、make、g++，且编译时需联网从 nodejs.org 下载 Node 头文件；离线环境参考常见问题一节。

### 方式三：恢复沙箱专用配置

```
cp package.sandbox.json.bak package.json
npm start
```

通过 NODE_PATH 复用平台预编译 node-pty，仅限原沙箱环境使用，其他机器勿用。

### （可选）Docker 部署

项目根目录可新建 Dockerfile：

```
FROM node:22-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.portable.json ./package.json
RUN npm install --omit=dev
COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
```

构建与运行：

```
docker build -t web-terminal .
docker run -d -p 3000:3000 -e ACCESS_TOKEN=你的密码 web-terminal
```

## 安全建议

- 务必设置强 ACCESS_TOKEN，不要把无密码实例暴露在公网。
- .env 已被 .gitignore 忽略，密码不会提交到版本库；也不要把 .env 随项目打包分发。
- 建议仅在内网 / 受信网络使用，或前置反向代理加 TLS 与访问控制。

## 常见问题

- **npm 报 Could not determine Node.js install directory**：PowerShell 下 npm.ps1 解析异常，改用 npm.cmd 或 C:\Program Files\nodejs\npm.cmd。
- **预编译二进制下载失败**（GitHub 访问受限）：fork 会回退到本地编译，此时 Windows 才需要 VS Build Tools；或在可访问 GitHub 的机器安装后整目录拷贝 node_modules。
- **启动日志 injected env (0)**：.env 未被加载。检查文件是否在项目根目录、格式是否为 KEY=VALUE、是否被 BOM 干扰（记事本另存为 UTF-8 无 BOM）。
- **连接立即断开 / 打不开终端**：检查 .env 的 SHELL 路径是否存在（Git Bash 默认 C:\Program Files\Git\bin\bash.exe）、HOME 目录是否存在；报错详见 server.err.log。
- **无密码也能连上**：检查 ACCESS_TOKEN 是否注入（启动日志应打印 token required 字样）。
- **验证服务状态**：访问 http://127.0.0.1:3000/health 应返回 ok
- **Linux/macOS 下 node-pty 源码编译失败**：缺构建工具时先安装 build-essential（Debian/Ubuntu）或 Development Tools（CentOS）；报 node-vXX-headers 网络错误说明需访问 nodejs.org，可换网络或用 npm config set nodedir 指向本机头文件。
