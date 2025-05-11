import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Игнорируем A-Frame элементы
          isCustomElement: (tag) => ['a-scene', 'a-entity', 'a-camera', 'a-entity'].includes(tag)
        }
      }
    }),
    basicSsl()
  ],
  server: {
    https: true,
    host: true,
    port: 5173
  }
})
