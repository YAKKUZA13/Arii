import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Игнорируем A-Frame элементы
          isCustomElement: (tag) => tag.startsWith('a-') // Все элементы, начинающиеся с a-
        }
      }
    }),
    basicSsl()
  ],
  server: {
    https: true,
    host: true,
    port: 5173
  },
  // Настраиваем оптимизацию для зависимостей
  optimizeDeps: {
    include: ['three', 'aframe-event-set-component'],
    // Исключаем A-Frame и AR.js, так как они загружаются через CDN
    exclude: ['aframe', 'ar.js']
  },
  // Разрешаем доступ к некоторым файлам из node_modules для клиента
  resolve: {
    alias: {
      '@components': resolve(__dirname, 'src/components')
    }
  },
  // Настраиваем обработку ассетов
  assetsInclude: ['**/*.glb', '**/*.gltf', '**/*.bin']
})
