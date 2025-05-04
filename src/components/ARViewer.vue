<template>
  <div class="ar-container">
    <div ref="container" class="ar-viewer"></div>
    <div v-if="!isSupported" class="ar-not-supported">
      Ваше устройство не поддерживает AR. Пожалуйста, используйте современный браузер с поддержкой WebXR.
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js'

const container = ref(null)
const isSupported = ref(false)
let renderer, scene, camera, controller

const init = async () => {
  // Проверка поддержки WebXR
  if (navigator.xr) {
    isSupported.value = await navigator.xr.isSessionSupported('immersive-ar')
  }

  if (!isSupported.value) return

  // Создание сцены
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 20)

  // Создание рендерера
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.xr.enabled = true
  container.value.appendChild(renderer.domElement)

  // Добавление кнопки AR
  document.body.appendChild(ARButton.createButton(renderer))

  // Создание контроллера
  controller = renderer.xr.getController(0)
  controller.addEventListener('select', onSelect)
  scene.add(controller)

  // Добавление света
  const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1)
  scene.add(light)

  // Анимация
  renderer.setAnimationLoop(animate)
}

const animate = () => {
  renderer.render(scene, camera)
}

const onSelect = () => {
  // Создание объекта при нажатии
  const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1)
  const material = new THREE.MeshPhongMaterial({ color: 0x00ff00 })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(0, 0, -0.5)
  scene.add(mesh)
}

const handleResize = () => {
  if (!camera || !renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

onMounted(() => {
  init()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (renderer) {
    renderer.dispose()
  }
})
</script>

<style scoped>
.ar-container {
  position: relative;
  width: 100%;
  height: 100vh;
}

.ar-viewer {
  width: 100%;
  height: 100%;
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