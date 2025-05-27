import { defineConfig } from 'vite';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

console.log(monacoEditorPlugin)

// https://vitejs.dev/config/
export default defineConfig({
  base: './', // 设置为相对路径，支持在任意目录下部署
  plugins: [
    (monacoEditorPlugin as any).default({}),
  ],
})
