<template>
  <div class="ar-container">
    <a-scene
      embedded
      arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix; matrixCodeType: 3x3;"
      renderer="logarithmicDepthBuffer: true;"
      @arjs-marker-found="onMarkerFound"
    >
      <!-- Маркер для AR.js -->
      <a-marker preset="hiro">
        <!-- 3D модель -->
        <a-entity
          gltf-model="/models/grusha.glb"
          scale="0.5 0.5 0.5"
          position="0 0.5 0"
          rotation="90 90 90"
          animation="property: rotation; to: 0 90 0; loop: false; dur: 10000;"
        ></a-entity>
      </a-marker>
      <a-entity v-if="fixedModelPosition" 
                :position="fixedModelPosition" 
                gltf-model="/models/grusha.glb"
                scale="0.5 0.5 0.5"
                rotation="0 90 0"></a-entity>
      <!-- Камера -->
      <a-entity camera></a-entity>
    </a-scene>

    <!-- Сообщение о неподдерживаемом устройстве -->
    <div v-if="!isSupported" class="ar-not-supported">
      Ваше устройство не поддерживает AR. Пожалуйста, используйте современный браузер с поддержкой AR.js.
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

const isSupported = ref(true)
const marker = ref(null)
const model = ref(null)
const fixedModelPosition = ref(null)

const onMarkerFound = () => {
  if (!fixedModelPosition.value) {
    // Получаем мировые координаты маркера
    const markerPosition = marker.value.object3D.position
    const worldPosition = marker.value.object3D.parent.worldToLocal(markerPosition.clone())
    
    // Фиксируем позицию
    fixedModelPosition.value = `${worldPosition.x} ${worldPosition.y} ${worldPosition.z}`
    
    // Скрываем оригинальную модель
    model.value.object3D.visible = false
  }
}
onMounted(() => {
  // Проверяем поддержку WebGL
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
  isSupported.value = !!gl
  AFRAME.registerComponent('persistent-position', {
    tick: function() {
      if (this.el.isPersisted) {
        const camera = document.querySelector('[camera]').object3D
        this.el.object3D.position.sub(camera.position)
      }
    }
  })
})
</script>

<style scoped>
.ar-container {
  position: relative;
  width: 100%;
  height: 100vh;
}

.ar-not-supported {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
}
</style> 