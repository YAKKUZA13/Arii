<template>
  <div class="ar-viewer">
    <!-- Индикатор ориентации для мобильных устройств -->
    <div v-if="showOrientationMessage" class="orientation-message">
      Пожалуйста, поверните устройство в горизонтальное положение
    </div>

    <!-- Отладочная информация -->
    <div v-if="isMobile" class="debug-info">
      <p>Модель: {{ modelPath }}</p>
      <p>Координаты: {{ userPosition ? `${userPosition.lat}, ${userPosition.lng}` : 'не определены' }}</p>
    </div>

    <div ref="sceneContainer" class="scene-container"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as LocAR from 'locar'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// Состояние загрузки
const userPosition = ref(null)
const isMobile = ref(false)
const showOrientationMessage = ref(false)
const modelPath = ref('/assets/models/grusha.glb')
const sceneContainer = ref(null)

// Константы для генерации координат
const radius = 2 // радиус в метрах

// Функция для определения мобильного устройства
const checkMobile = () => {
  isMobile.value = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
  console.log('Мобильное устройство:', isMobile.value)
}

// Функция для проверки ориентации экрана
const checkOrientation = () => {
  if (isMobile.value) {
    showOrientationMessage.value = window.innerHeight > window.innerWidth
    console.log('Ориентация экрана:', showOrientationMessage.value ? 'вертикальная' : 'горизонтальная')
  }
}

// Функция для загрузки модели
const loadModel = async (url) => {
  const loader = new GLTFLoader()
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        console.log('Модель успешно загружена')
        resolve(gltf.scene)
      },
      undefined,
      (error) => {
        console.error('Ошибка загрузки модели:', error)
        reject(error)
      }
    )
  })
}

// Функция для расчета расстояния между двумя точками
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000 // радиус Земли в метрах
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Функция для генерации координат в радиусе
const generateCoordinates = (centerLat, centerLng) => {
  const R = 6371000 // радиус Земли в метрах
  const angle = Math.random() * 2 * Math.PI
  const distance = radius
    
  const latDistance = distance / R
  const lngDistance = distance / (R * Math.cos(centerLat * Math.PI / 180))
  
  const newLat = centerLat + (latDistance * 180 / Math.PI)
  const newLng = centerLng + (lngDistance * 180 / Math.PI)
  
  const dist = calculateDistance(centerLat, centerLng, newLat, newLng)
  
  return {
    lat: newLat,
    lng: newLng,
    distance: dist
  }
}

// Тестовые координаты (Москва)
const TEST_COORDINATES = {
  lat: 55.7558,
  lng: 37.6173,
  accuracy: 100
}

onMounted(async () => {
  console.log('Начало инициализации AR')
  
  // Проверяем мобильное устройство
  checkMobile()
  
  // Добавляем обработчики событий
  window.addEventListener('resize', checkOrientation)
  window.addEventListener('orientationchange', checkOrientation)
  
  // Проверяем ориентацию
  checkOrientation()
  
  try {
    console.log('Запрос геолокации...')
    
    // Получаем геолокацию с улучшенной обработкой ошибок
    const pos = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        console.warn('Геолокация не поддерживается')
        return resolve({
          coords: TEST_COORDINATES
        })
      }

      const timeout = setTimeout(() => {
        console.log('Таймаут: используем тестовые координаты')
        resolve({
          coords: TEST_COORDINATES
        })
      }, 10000)

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeout)
          resolve(position)
        },
        (error) => {
          clearTimeout(timeout)
          console.log('Ошибка геолокации:', error)
          resolve({
            coords: TEST_COORDINATES
          })
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      )
    })
    
    // Гарантированное получение координат
    userPosition.value = {
      lat: pos.coords.latitude || TEST_COORDINATES.lat,
      lng: pos.coords.longitude || TEST_COORDINATES.lng
    }
    
    console.log('Используемые координаты:', userPosition.value)
    
    // Генерируем координаты для модели с проверкой
    const modelCoords = generateCoordinates(userPosition.value.lat, userPosition.value.lng)
    console.log('Координаты модели:', modelCoords)
    
    // Инициализируем LocAR с явным указанием позиции
    const locar = new LocAR.LocationBased(sceneContainer.value)
    
    // Явная инициализация GPS перед добавлением объектов
    locar.startGps(
      userPosition.value.lat,
      userPosition.value.lng,
      0 // Высота
    )
    
    // Загружаем и добавляем модель
    const model = await loadModel(modelPath.value)
    model.scale.set(0.8, 0.8, 0.8)
    
    locar.add(model, {
      lat: modelCoords.lat,
      lon: modelCoords.lng,
      alt: 0
    })
    
    // Обработчик обновления позиции
    locar.onGpsUpdate = (position) => {
      console.log('GPS обновлен:', position)
    }
    
  } catch (error) {
    console.error('Ошибка инициализации AR:', error)
    alert(`AR ошибка: ${error.message}`)
  }
})

onUnmounted(() => {
  // Удаляем обработчики событий
  window.removeEventListener('resize', checkOrientation)
  window.removeEventListener('orientationchange', checkOrientation)
})
</script>

<style scoped>
.ar-viewer {
  width: 100%;
  height: 100vh;
  position: relative;
  overflow: hidden;
}

.scene-container {
  width: 100%;
  height: 100%;
}

.orientation-message {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  text-align: center;
  padding: 15px;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
}

.debug-info {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 10px;
  font-size: 12px;
  z-index: 1000;
}

/* Стили для мобильных устройств */
@media (max-width: 768px) {
  .ar-viewer {
    touch-action: none;
  }
  
  .scene-container {
    touch-action: none;
  }
}
</style> 