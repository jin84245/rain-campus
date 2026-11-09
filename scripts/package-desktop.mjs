import { cpSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const electronPath = resolve(root, 'node_modules/electron/dist');
const outputPath = resolve(root, 'release/雨落校园-V4.3-win-x64');
const appPath = join(outputPath, 'resources/app');

cpSync(electronPath, outputPath, { recursive: true, force: true });
renameSync(join(outputPath, 'electron.exe'), join(outputPath, '雨落校园.exe'));
mkdirSync(join(appPath, 'desktop'), { recursive: true });
cpSync(resolve(root, 'desktop/main.cjs'), join(appPath, 'desktop/main.cjs'));
cpSync(resolve(root, 'dist'), join(appPath, 'dist'), { recursive: true, force: true });
cpSync(resolve(root, 'docs/使用手册.md'), join(outputPath, '使用手册.md'));
writeFileSync(join(appPath, 'package.json'), JSON.stringify({
  name: 'rain-campus',
  productName: '雨落校园',
  version: '1.0.0',
  main: 'desktop/main.cjs'
}, null, 2));
writeFileSync(join(outputPath, '运行说明.txt'), [
  '雨落校园 Windows x64 便携版',
  '',
  '双击 雨落校园.exe 启动游戏。',
  '无需安装 Node.js、浏览器或额外运行环境。',
  '请保持此文件夹内的文件和 resources 文件夹完整。'
].join('\r\n'));

process.stdout.write(`桌面版已打包：${outputPath}\n`);
