import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages는 https://<user>.github.io/<repo>/ 아래에서 서비스되므로
// base 경로를 저장소 이름에 맞춘다.
export default defineConfig({
  base: '/sknr-optimizer/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
  },
});
