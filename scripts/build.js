import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
for (const path of ['index.html', 'favicon.svg']) await copyFile(path, `dist/${path}`);
await cp('src', 'dist/src', { recursive: true });
await copyFile('index.html', 'dist/404.html');
console.log('Built dependency-free demo in dist/.');
