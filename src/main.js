import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

const app = createApp(App)

// Добавляем конфигурацию для A-Frame компонентов
app.config.compilerOptions.isCustomElement = (tag) => {
  return tag.startsWith('a-')
}

app.mount('#app')
