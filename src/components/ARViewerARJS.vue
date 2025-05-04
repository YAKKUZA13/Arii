<template>
  <div class="ar-viewer">
    <!-- Индикатор ориентации для мобильных устройств -->
    <div v-if="showOrientationMessage" class="orientation-message">
      Пожалуйста, поверните устройство в горизонтальное положение
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
      ></a-camera>

      <!-- 3D модели с разбросом координат -->
      <a-entity
        v-for="(coord, index) in coordinates"
        :key="index"
        gps-entity-place
        :latitude="coord.lat"
        :longitude="coord.lng"
        gltf-model="url(/assets/models/grusha.glb)"
        :scale="`${coord.scale} ${coord.scale} ${coord.scale}`"
        :rotation="`0 ${coord.rotation} 0`"
        animation-mixer="clip: *; loop: repeat"
        @model-error="handleModelError"
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
            :value="`${coord.distance.toFixed(1)}м`"
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

// Константы для генерации координат
const radius = 15 // радиус в метрах
const numberOfModels = 5 // количество моделей

// Массив координат с дополнительными параметрами
const coordinates = ref([])

// Функция для определения мобильного устройства
const checkMobile = () => {
  isMobile.value = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

// Функция для проверки ориентации экрана
const checkOrientation = () => {
  if (isMobile.value) {
    showOrientationMessage.value = window.innerHeight > window.innerWidth
  }
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
  const R = 6371000 // радиус Земли в метрах
  const coords = []
  
  for (let i = 0; i < numberOfModels; i++) {
    // Генерируем случайный угол и расстояние
    const angle = Math.random() * 2 * Math.PI
    const distance = Math.random() * radius
    
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
      scale: 1 + Math.random() * 0.5, // случайный масштаб
      rotation: Math.random() * 360 // случайный поворот
    })
  }
  
  return coords
}

// Обработчик ошибок загрузки модели
const handleModelError = (error) => {
  console.error('Ошибка загрузки модели:', error)
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
    
    // Пробуем получить геолокацию с увеличенным таймаутом
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
    
    // Генерируем координаты вокруг текущей позиции
    coordinates.value = generateRandomCoordinates(
      userPosition.value.lat,
      userPosition.value.lng
    )
    console.log('Координаты сгенерированы:', coordinates.value)

    // Добавляем слушатель изменения геопозиции
    navigator.geolocation.watchPosition(
      (position) => {
        console.log('Обновление геопозиции:', position)
        userPosition.value = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        }
      },
      (error) => {
        console.error('Ошибка отслеживания геопозиции:', error)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )
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