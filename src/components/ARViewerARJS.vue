<template>
  <div class="ar-container">
    <a-scene
      embedded
      arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix; matrixCodeType: 3x3;"
      renderer="logarithmicDepthBuffer: true;"
    >
      <!-- Маркер для AR.js -->
      <a-marker preset="hiro">
        <!-- 3D модель -->
        <a-entity
          gltf-model="https://raw.githack.com/AR-js-org/AR.js/master/aframe/examples/image-tracking/nft/trex/scene.gltf"
          scale="0.05 0.05 0.05"
          position="0 0.5 0"
          animation="property: rotation; to: 0 360 0; loop: true; dur: 10000;"
        ></a-entity>
      </a-marker>
      
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

onMounted(() => {
  // Проверяем поддержку WebGL
  const canvas = document.createElement('canvas')
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl')
  isSupported.value = !!gl
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