import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// Three.js теперь подключается через CDN в index.html

// Импортируем дополнительные компоненты для A-Frame
import 'aframe-event-set-component'

// Импортируем инструменты отладки AR.js
import { checkARJSStatus, monitorARJSErrors } from './debug-arjs'

// Проверяем, были ли успешно загружены AR.js и A-Frame
document.addEventListener('DOMContentLoaded', () => {
  // Проверяем наличие A-Frame и AR.js
  if (window.AFRAME) {
    console.log('A-Frame успешно загружен, версия:', window.AFRAME.version);
    
    // Проверяем, есть ли AR.js в системах A-Frame
    if (window.AFRAME.systems && window.AFRAME.systems.arjs) {
      console.log('AR.js успешно загружен и интегрирован с A-Frame');
    } else {
      console.warn('AR.js не обнаружен в системах A-Frame! Проверьте подключение в index.html');
    }
  } else {
    console.error('A-Frame не был загружен! Проверьте подключение в index.html');
  }
});

// Создаем приложение Vue
createApp(App).mount('#app')
