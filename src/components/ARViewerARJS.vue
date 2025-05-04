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

    <a-scene
      embedded
      arjs="trackingMethod: best; sourceType: webcam; debugUIEnabled: true; detectionMode: mono_and_matrix; matrixCodeType: 3x3;"
      renderer="logarithmicDepthBuffer: true; precision: medium;"
      vr-mode-ui="enabled: false"
      :class="{ 'mobile-view': isMobile }"
    >
      <!-- Камера с поддержкой GPS и ориентации -->
      <a-camera
        gps-camera
        rotation-reader
        device-orientation-permission-ui="enabled: true"
        :look-controls="isMobile ? 'enabled: true' : 'enabled: true'"
        :gps-camera="isMobile ? 'minDistance: 0; maxDistance: 1000;' : 'minDistance: 0; maxDistance: 1000;'"
      ></a-camera>

      <!-- Одна 3D модель -->
      <a-entity
        v-if="coordinates.length > 0"
        gps-entity-place
        :latitude="coordinates[0].lat"
        :longitude="coordinates[0].lng"
        :gltf-model="modelPath"
        :scale="`${coordinates[0].scale} ${coordinates[0].scale} ${coordinates[0].scale}`"
        :rotation="`90 90 90`"
        animation-mixer="clip: *; loop: repeat"
        @model-error="handleModelError"
        @model-loaded="handleModelLoaded"
        :gps-entity-place="isMobile ? 'minDistance: 0; maxDistance: 1000;' : 'minDistance: 0; maxDistance: 1000;'"
      >
        <!-- Добавляем индикатор расстояния -->
        <a-entity
          position="0 2 0"
          scale="2 2 2"
        >
          <a-plane
            :material="`color: white; opacity: 0.7;`"
            width="1"
            height="0.5"
          ></a-plane>
          <a-text
            :value="`${coordinates[0].distance.toFixed(1)}м`"
            align="center"
            color="black"
            position="0 0 0.01"
            width="1"
            font="mozillavr"
          ></a-text>
        </a-entity>
      </a-entity>

      <!-- Добавляем индикатор направления -->
      <a-entity
        v-if="userPosition"
        gps-entity-place
        :latitude="userPosition.lat"
        :longitude="userPosition.lng"
        position="0 0 0"
        :gps-entity-place="isMobile ? 'minDistance: 0; maxDistance: 1000;' : 'minDistance: 0; maxDistance: 1000;'"
      >
        <a-ring
          color="yellow"
          radius-inner="0.1"
          radius-outer="0.2"
          rotation="-90 0 0"
        ></a-ring>
      </a-entity>
    </a-scene>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

// Состояние загрузки
const userPosition = ref(null)
const isMobile = ref(false)
const showOrientationMessage = ref(false)
const modelPath = ref('/assets/models/grusha.glb')
const modelsGenerated = ref(false)

// Константы для генерации координат
const radius = 2 // радиус в метрах
const numberOfModels = 1 // количество моделей

// Массив координат с дополнительными параметрами
const coordinates = ref([])

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

// Обработчик успешной загрузки модели
const handleModelLoaded = (event) => {
  console.log('Модель успешно загружена:', event)
}

// Обработчик ошибок загрузки модели
const handleModelError = (error) => {
  console.error('Ошибка загрузки модели:', error)
  console.log('Путь к модели:', modelPath.value)
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

// Функция для генерации случайных координат в радиусе
const generateRandomCoordinates = (centerLat, centerLng) => {
  if (modelsGenerated.value) return // Не генерируем модели повторно
  
  const R = 6371000 // радиус Земли в метрах
  const coords = []
  
  // Генерируем только одну модель
  const angle = Math.random() * 2 * Math.PI
  const distance = radius // Фиксированное расстояние
  
  // Конвертируем расстояние в градусы
  const latDistance = distance / R
  const lngDistance = distance / (R * Math.cos(centerLat * Math.PI / 180))
  
  // Вычисляем новые координаты
  const newLat = centerLat + (latDistance * 180 / Math.PI)
  const newLng = centerLng + (lngDistance * 180 / Math.PI)
  
  // Вычисляем расстояние от центра
  const dist = calculateDistance(centerLat, centerLng, newLat, newLng)
  
  coords.push({
    lat: newLat,
    lng: newLng,
    distance: dist,
    scale: isMobile.value ? 0.8 : 1.2, // Фиксированный масштаб
    rotation: 0
  })
  
  modelsGenerated.value = true
  return coords
}

// Тестовые координаты (Москва)
const TEST_COORDINATES = {
  lat: 55.7558,
  lng: 37.6173
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
    
    // Получаем геолокацию один раз
    const pos = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log('Используем тестовые координаты из-за таймаута')
        resolve({
          coords: {
            latitude: TEST_COORDINATES.lat,
            longitude: TEST_COORDINATES.lng,
            accuracy: 100
          }
        })
      }, 10000) // 10 секунд таймаут

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeout)
          resolve(position)
        },
        (error) => {
          clearTimeout(timeout)
          console.log('Ошибка геолокации, используем тестовые координаты:', error)
          resolve({
            coords: {
              latitude: TEST_COORDINATES.lat,
              longitude: TEST_COORDINATES.lng,
              accuracy: 100
            }
          })
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      )
    })
    
    userPosition.value = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude
    }
    console.log('Координаты получены:', userPosition.value)
    
    // Генерируем координаты вокруг текущей позиции один раз
    coordinates.value = generateRandomCoordinates(
      userPosition.value.lat,
      userPosition.value.lng
    )
    console.log('Координаты сгенерированы:', coordinates.value)
    
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

a-scene {
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
  
  a-scene.mobile-view {
    touch-action: none;
  }
}
</style> 