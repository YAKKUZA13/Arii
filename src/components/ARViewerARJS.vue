<template>
  <div class="ar-container">
    <a-scene
      embedded
      shadow="type: pcfsoft"
      arjs="sourceType: webcam; 
            debugUIEnabled: false; 
            detectionMode: mono; 
            sourceWidth: 1280;
            sourceHeight: 720;
            displayWidth: 1280;
            displayHeight: 720;
            maxDetectionRate: 60;
            canvasWidth: 1280;
            canvasHeight: 720;
            trackingMethod: best;"
      renderer="logarithmicDepthBuffer: true; antialias: true;"
      vr-mode-ui="enabled: false"
      device-orientation-permission-ui="enabled: false"
      @camera-init="onCameraInit"
      @camera-error="onCameraError"
      @loaded="onSceneLoaded"
      cursor="rayOrigin: mouse"
      raycaster="objects: .clickable"
    >
      <!-- Directional light для теней -->
      <a-entity light="type: directional; castShadow: true; intensity: 0.7; color: #fff" position="2 6 2"></a-entity>
      <!-- Ambient light для мягкого освещения -->
      <a-entity light="type: ambient; intensity: 0.4; color: #888"></a-entity>

      <!-- Плоскость-пол, принимающая тени -->

      <!-- Ваша gltf-модель -->
      <a-entity
        gltf-model="/models/drage.glb"
        scale="0.5 0.5 0.5"
        position="0 0 -2"
        rotation="0 90 0"
        animation="property: rotation; to: 0 450 0; loop: true; dur: 10000;"
        clickable
        draggable
        rotatable
        scalable
        hoverable="
          hoverProperty: scale;
          hoverValue: 0.6 0.6 0.6;
          originalValue: 0.5 0.5 0.5"
        gesture-handler="
          dragEnabled: true;
          rotateEnabled: true;
          pinchEnabled: true;
          minScale: 0.3;
          maxScale: 2;"
        shadow="cast: false"
      ></a-entity>

      <a-entity camera look-controls>
        <a-entity 
          cursor="rayOrigin: mouse; fuse: false"
          position="0 0 -1"
          geometry="primitive: ring; radiusInner: 0.02; radiusOuter: 0.03"
          material="color: #CCC; shader: flat">
        </a-entity>
      </a-entity>

      <a-assets>
        <a-asset-item id="model1" src="/models/drage.glb"></a-asset-item>
      </a-assets>
      <a-entity
        id="placed-model"
        gltf-model="#model1"
        visible="false"
        class="clickable"
        @click="onModelClick"
      ></a-entity>
    </a-scene>

    <!-- Canvas для прямоугольников -->
    <canvas ref="overlayCanvas" class="overlay-canvas"></canvas>

    <!-- Улучшенное сообщение о неподдерживаемом устройстве -->
    <div v-if="!isSupported" class="ar-not-supported">
      <p>Ваше устройство не поддерживает AR. Пожалуйста, используйте:</p>
      <ul>
        <li>Современный браузер с поддержкой WebGL</li>
        <li>Устройство с камерой</li>
        <li>Разрешите доступ к камере</li>
      </ul>
    </div>

    <!-- Отладочная информация -->
    <div class="debug-info" v-if="!debugInfo">
      <p>Статус камеры: {{ debugInfo.cameraStatus }}</p>
      <p>Разрешение: {{ debugInfo.resolution }}</p>
      <p>Ошибки: {{ debugInfo.errors }}</p>
      <p>AR.js статус: {{ debugInfo.arStatus }}</p>
      <p>Последнее обновление: {{ debugInfo.lastUpdate }}</p>
      <p>Глитч статус: {{ debugInfo.glitchStatus }}</p>
      <p>Статус модели: {{ debugInfo.modelStatus }}</p>
      <p>Статус coco-ssd: {{ debugInfo.cocoStatus }}</p>
      <div v-if="detectedBoxes.length" class="detected-objects">
        <p>Распознанные объекты:</p>
        <ul>
          <li v-for="(box, idx) in detectedBoxes" :key="idx">
            {{ box.class }} ({{ (box.score * 100).toFixed(1) }}%)
          </li>
        </ul>
      </div>
    </div>

    
  </div>
</template>

<script setup>
import { ref, onMounted, watchEffect, nextTick, onBeforeUnmount } from 'vue'

const isSupported = ref(true)
const marker = ref(null)
const model = ref(null)
const fixedModelPosition = ref(null)
const debugInfo = ref({
  cameraStatus: 'Инициализация...',
  resolution: 'Не определено',
  errors: '',
  arStatus: 'Инициализация...',
  lastUpdate: new Date().toLocaleTimeString(),
  glitchStatus: 'Инициализация...',
  modelStatus: 'Модель не загружена',
  cocoStatus: 'coco-ssd: не загружена'
})

const updateDebugInfo = (updates) => {
  debugInfo.value = {
    ...debugInfo.value,
    ...updates,
    lastUpdate: new Date().toLocaleTimeString()
  }
}

const onCameraInit = (event) => {
  console.log('Camera initialized:', event);
  updateDebugInfo({
    cameraStatus: 'Камера инициализирована',
    arStatus: 'AR.js активен'
  });
}

const onCameraError = (error) => {
  console.error('Camera error:', error);
  updateDebugInfo({
    cameraStatus: 'Ошибка камеры',
    errors: `Ошибка камеры: ${error.detail || 'Неизвестная ошибка'}`
  });
}

const onSceneLoaded = async () => {
  console.log('Scene loaded');
  updateDebugInfo({
    cameraStatus: 'Сцена загружена'
  });

  try {
    // Проверяем наличие A-Frame
    if (!window.AFRAME) {
      throw new Error('A-Frame не найден');
    }

    // Проверяем наличие AR.js
    if (!window.AFRAME.systems.arjs) {
      console.log('AR.js systems:', window.AFRAME.systems);
      throw new Error('AR.js не найден в системах A-Frame');
    }

    // Даем время на инициализацию AR.js
    await new Promise(resolve => setTimeout(resolve, 2000));

    const scene = document.querySelector('a-scene');
    if (!scene) {
      throw new Error('Сцена не найдена');
    }

    const arSystem = scene.systems['arjs'];
    if (!arSystem) {
      console.log('Available systems:', Object.keys(scene.systems));
      throw new Error('AR.js система не инициализирована');
    }

    // Проверяем статус камеры
    const camera = document.querySelector('[camera]');
    if (!camera || !camera.components.camera) {
      throw new Error('Камера не инициализирована');
    }

    updateDebugInfo({
      cameraStatus: 'AR.js успешно инициализирован',
      arStatus: 'AR.js активен'
    });

    // Проверяем статус AR.js каждую секунду
    setInterval(() => {
      if (arSystem.arProfile) {
        const source = arSystem.arProfile.source;
        const isCameraActive = source && source.readyState === 4;
        updateDebugInfo({
          arStatus: `AR.js активен (${isCameraActive ? 'камера активна' : 'камера неактивна'})`
        });
      }
    }, 1000);

  } catch (error) {
    console.error('Ошибка при инициализации AR.js:', error);
    updateDebugInfo({
      errors: `Ошибка AR.js: ${error.message}`,
      arStatus: 'Ошибка инициализации'
    });
  }
}

onMounted(async () => {
  try {
    // Проверка поддержки WebGL
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) {
      throw new Error('WebGL не поддерживается');
    }

    // Запрашиваем разрешение на использование камеры
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } 
    });
    
    updateDebugInfo({
      cameraStatus: 'Камера доступна',
      resolution: `${stream.getVideoTracks()[0].getSettings().width}x${stream.getVideoTracks()[0].getSettings().height}`
    });

  } catch (error) {
    isSupported.value = false;
    updateDebugInfo({
      cameraStatus: 'Ошибка',
      errors: `Ошибка: ${error.message}`
    });
    console.error('Ошибка при инициализации:', error);
  }
});

// --- TensorFlow.js coco-ssd интеграция ---
let cocoModel = null
const detectedBoxes = ref([]) // массив прямоугольников [x, y, w, h]

// --- Общий canvas и texture для glitch-effect ---
let sharedCameraCanvas = null
let sharedCameraCtx = null
let sharedCameraTexture = null
let sharedVideo = null

function ensureSharedCameraTexture() {
  if (!sharedCameraCanvas) {
    sharedCameraCanvas = document.createElement('canvas');
    sharedCameraCanvas.width = 320;
    sharedCameraCanvas.height = 240;
    sharedCameraCtx = sharedCameraCanvas.getContext('2d', { willReadFrequently: true });
    sharedCameraTexture = new THREE.Texture(sharedCameraCanvas);
    sharedCameraTexture.minFilter = THREE.LinearFilter;
    sharedCameraTexture.magFilter = THREE.LinearFilter;
    sharedCameraTexture.format = THREE.RGBAFormat;
    sharedCameraTexture.generateMipmaps = false;
    sharedVideo = null;
  }
}

function updateSharedCameraTexture() {
  ensureSharedCameraTexture();
  if (!sharedVideo) {
    sharedVideo = document.querySelector('video');
    if (!sharedVideo) return;
  }
  if (sharedVideo.readyState === sharedVideo.HAVE_ENOUGH_DATA) {
    sharedCameraCtx.drawImage(sharedVideo, 0, 0, sharedCameraCanvas.width, sharedCameraCanvas.height);
    sharedCameraTexture.needsUpdate = true;
  }
}

async function loadCocoModel() {
  try {
    updateDebugInfo({ modelStatus: 'Загрузка моделей...', cocoStatus: 'coco-ssd: загрузка...' });

    // tfjs 3.21.0
    if (!window.tf) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/dist/tf.min.js';
        s.onload = resolve;
        s.onerror = () => { 
          updateDebugInfo({ errors: 'Ошибка загрузки tfjs' }); 
          console.error('Ошибка загрузки tfjs');
          reject(new Error('Ошибка загрузки tfjs')); 
        };
        document.head.appendChild(s);
      });
    }

    // tfjs-backend-webgl 3.21.0
    if (!window.tf?.backend || !window.tf.getBackend || window.tf.getBackend() !== 'webgl') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@3.21.0/dist/tf-backend-webgl.min.js';
        s.onload = async () => { 
          try {
            await window.tf.setBackend('webgl'); 
            await window.tf.ready(); 
            resolve(); 
          } catch (e) {
            updateDebugInfo({ errors: 'Ошибка инициализации tfjs-backend-webgl' });
            console.error('Ошибка инициализации tfjs-backend-webgl', e);
            reject(e);
          }
        };
        s.onerror = () => { 
          updateDebugInfo({ errors: 'Ошибка загрузки tfjs-backend-webgl' }); 
          console.error('Ошибка загрузки tfjs-backend-webgl');
          reject(new Error('Ошибка загрузки tfjs-backend-webgl')); 
        };
        document.head.appendChild(s);
      });
    }

    // coco-ssd 2.2.2
    if (!window.cocoSsd) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.2/dist/coco-ssd.min.js';
        s.onload = resolve;
        s.onerror = () => { 
          updateDebugInfo({ errors: 'Ошибка загрузки coco-ssd' }); 
          console.error('Ошибка загрузки coco-ssd');
          reject(new Error('Ошибка загрузки coco-ssd')); 
        };
        document.head.appendChild(s);
      });
    }

    try {
      cocoModel = await window.cocoSsd.load();
      updateDebugInfo({ cocoStatus: 'coco-ssd: загружена' });
    } catch (e) {
      updateDebugInfo({ cocoStatus: 'coco-ssd: ошибка', errors: 'Ошибка инициализации coco-ssd' });
      console.error('Ошибка инициализации coco-ssd', e);
      throw e;
    }

    updateDebugInfo({ modelStatus: 'Модель успешно загружена' });
  } catch (error) {
    updateDebugInfo({ modelStatus: 'Ошибка загрузки модели', errors: error.message });
    console.error('Ошибка загрузки модели:', error);
  }
}

async function detectLoop() {
  try {
    const video = document.querySelector('video');
    if (cocoModel && video && video.readyState === 4) {
      const predictions = await cocoModel.detect(video);
      detectedBoxes.value = predictions.map(pred => ({
        bbox: pred.bbox,
        class: pred.class,
        score: pred.score
      }));
    }
  } catch (error) {
    updateDebugInfo({ errors: error.message });
  }
  requestAnimationFrame(detectLoop);
}

onMounted(async () => {
  await loadCocoModel();
  detectLoop();
});

AFRAME.registerComponent('glitch-effect', {
  schema: {
    intensity: { type: 'number', default: 1.0 },
    offsetX: { type: 'number', default: 0.7 },
    offsetY: { type: 'number', default: 0.6 },
    radius: { type: 'number', default: 0.5 }
  },

  init: function () {
    // Используем общий canvas/texture
    ensureSharedCameraTexture();
    this.cameraTexture = sharedCameraTexture;
    this.noVideo = false;
    this.hasVideo = false;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: this.data.intensity },
        cameraTexture: { value: this.cameraTexture },
        resolution: { value: new THREE.Vector2(sharedCameraCanvas.width, sharedCameraCanvas.height) },
        radius: { value: this.data.radius },
        center: { value: new THREE.Vector2(0.5, 0.5) },
        hasVideo: { value: 0 },
        boxCount: { value: 0 },
        boxes: { value: Array(10).fill(new THREE.Vector4(0,0,0,0)) }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform float intensity;
        uniform sampler2D cameraTexture;
        uniform vec2 resolution;
        uniform float radius;
        uniform vec2 center;
        uniform int hasVideo;
        uniform int boxCount;
        uniform vec4 boxes[10]; // x, y, w, h
        varying vec2 vUv;

        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }
        bool inBox(vec2 uv, vec4 box) {
          return uv.x > box.x && uv.x < (box.x + box.z) && uv.y > box.y && uv.y < (box.y + box.w);
        }
        void main() {
          vec2 uv = vUv;
          bool distorted = false;
          for (int i = 0; i < 10; i++) {
            if (i >= boxCount) break;
            if (inBox(uv, boxes[i])) {
              // Применяем искажение
              uv.x += 0.03 * sin(uv.y * 40.0 + time * 2.0);
              uv.y += 0.03 * cos(uv.x * 40.0 + time * 2.0);
              distorted = true;
            }
          }
          // Исправленный sampling: переворачиваем по y
          vec3 color = texture2D(cameraTexture, vec2(uv.x, 1.0 - uv.y)).rgb;
          if (!distorted && hasVideo == 0) {
            // fallback: прозрачный шум вне bbox если нет камеры
            color = vec3(random(uv + time), random(uv + time * 2.0), random(uv + time * 3.0));
            gl_FragColor = vec4(color, 0.3);
          } else {
            gl_FragColor = vec4(color, 1.0);
          }
        }
      `,
      transparent: true
    });
    this.el.addEventListener('loaded', () => {
      const mesh = this.el.getObject3D('mesh');
      if (mesh) {
        mesh.material = this.material;
      }
    });
  },

  tick: function (time) {
    // Обновляем общий canvas/texture
    updateSharedCameraTexture();
    if (this.material) {
      this.material.uniforms.time.value = time / 1000;
      this.material.uniforms.intensity.value = this.data.intensity;
      this.material.uniforms.hasVideo.value = sharedVideo && sharedVideo.readyState === 4 ? 1 : 0;
      // --- Передача bbox из detectedBoxes ---
      const boxes = (window.__vueDetectedBoxes || []);
      this.material.uniforms.boxCount.value = Math.min(boxes.length, 10);
      for (let i = 0; i < 10; i++) {
        if (i < boxes.length) {
          const bbox = boxes[i].bbox || [0, 0, 0, 0];
          const [x, y, w, h] = bbox;
          this.material.uniforms.boxes.value[i] = new THREE.Vector4(
            x / 1280,
            y / 720,
            w / 1280,
            h / 720
          );
        } else {
          this.material.uniforms.boxes.value[i] = new THREE.Vector4(0,0,0,0);
        }
      }
    }
  },

  remove: function () {
    if (this.cameraTexture) {
      this.cameraTexture.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }
    if (this.canvas) {
      this.canvas.width = 0;
      this.canvas.height = 0;
    }
    this.video = null;
  }
});

// --- Синхронизация detectedBoxes для glitch-effect ---
window.__vueDetectedBoxes = [];
watchEffect(() => {
  window.__vueDetectedBoxes = detectedBoxes.value;
});

const overlayCanvas = ref(null)
let lastRect = null
let glitchTime = 0;
let glitchAnimFrame = null;

// Кэшируем параметры полос для каждого bbox на несколько кадров вперёд
let glitchCache = {};

function syncOverlayCanvas() {
  const canvas = overlayCanvas.value
  const aframeCanvas = document.querySelector('a-scene canvas')
  if (!canvas || !aframeCanvas) return
  const rect = aframeCanvas.getBoundingClientRect()
  lastRect = rect
  canvas.style.position = 'fixed'
  canvas.style.left = rect.left + 'px'
  canvas.style.top = rect.top + 'px'
  canvas.width = rect.width
  canvas.height = rect.height
  canvas.style.width = rect.width + 'px'
  canvas.style.height = rect.height + 'px'
  canvas.style.pointerEvents = 'none'
  canvas.style.zIndex = 1000
}

function drawOverlay() {
  syncOverlayCanvas();
  const canvas = overlayCanvas.value;
  if (!canvas || !lastRect) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scaleX = canvas.width / 1280;
  const scaleY = canvas.height / 720;
  const video = document.querySelector('video');
  const t = glitchTime / 1000;

  detectedBoxes.value.forEach((box, boxIdx) => { // максимум 1 объект
    const [x, y, w, h] = box.bbox;
    if (video && video.readyState === 4) {
      for (let i = 0; i < h; i += 3) {
        const lineY = y + i;
        const lineHeight = 3;
        // Случайный сдвиг полосы
        const offset = (Math.random() - 0.5) * 40; // -20..+20 px
        // Иногда делаем RGB split
        if (i % 12 === 0) {
          // Красный канал
          ctx.globalAlpha = 0.7;
          ctx.drawImage(
            video,
            x, lineY, w, lineHeight,
            (x + offset + 8) * scaleX, lineY * scaleY, w * scaleX, lineHeight * scaleY
          );
          // Зелёный канал
          ctx.globalAlpha = 0.7;
          ctx.drawImage(
            video,
            x, lineY, w, lineHeight,
            (x + offset - 8) * scaleX, lineY * scaleY, w * scaleX, lineHeight * scaleY
          );
          // Синий канал
          ctx.globalAlpha = 0.7;
          ctx.drawImage(
            video,
            x, lineY, w, lineHeight,
            (x + offset) * scaleX, lineY * scaleY, w * scaleX, lineHeight * scaleY
          );
        } else {
          // Обычная смазанная полоса
          ctx.globalAlpha = 0.8;
          ctx.drawImage(
            video,
            x, lineY, w, lineHeight,
            (x + offset) * scaleX, lineY * scaleY, w * scaleX, lineHeight * scaleY
          );
        }
      }
      ctx.globalAlpha = 1.0;
    }
  });
}

function glitchOverlayLoop() {
  glitchTime = performance.now();
  drawOverlay();
  glitchAnimFrame = requestAnimationFrame(glitchOverlayLoop);
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  setTimeout(drawOverlay, 1000) // на случай, если canvas появляется с задержкой
  glitchOverlayLoop();
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (glitchAnimFrame) cancelAnimationFrame(glitchAnimFrame);
})

// Следим за изменениями bbox и обновляем canvas
watchEffect(() => {
  nextTick(() => {
    drawOverlay()
  })
})

// Синхронизируем overlay-canvas при изменении размера окна
function handleResize() {
  drawOverlay()
}

const isWebXRSupported = ref(true);

function onModelClick(evt) {
  alert('3D-объект нажат!');
}

</script>

<style scoped>
.ar-container {
  width: 100%;
  height: 100vh;
  position: relative;
  overflow: hidden;
}

.ar-container a-scene {
  width: 100% !important;
  height: 100% !important;
  position: absolute !important;
  top: 0 !important;
  left: 0 !important;
  z-index: 1;
}

#glitch-overlay {
  pointer-events: none;
  z-index: 2;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.debug-info {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 10px;
  border-radius: 5px;
  font-size: 12px;
  z-index: 1000;
}

.ar-not-supported {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 20px;
  border-radius: 10px;
  text-align: center;
  z-index: 1000;
}

.ar-not-supported ul {
  list-style: none;
  padding: 0;
  margin: 10px 0;
}

.ar-not-supported li {
  margin: 5px 0;
}

.overlay-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100% !important;
  height: 100% !important;
  pointer-events: none;
  z-index: 10;
}
</style> 