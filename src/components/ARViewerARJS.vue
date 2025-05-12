<template>
  <div class="ar-container">
    <a-scene
      embedded
      arjs="sourceType: webcam; 
            debugUIEnabled: true; 
            detectionMode: mono; 
            sourceWidth: 1280;
            sourceHeight: 720;
            displayWidth: 1280;
            displayHeight: 720;
            maxDetectionRate: 60;
            canvasWidth: 1280;
            canvasHeight: 720;
            sourceType: webcam;
            sourceWidth: 1280;
            sourceHeight: 720;
            displayWidth: 1280;
            displayHeight: 720;
            debugUIEnabled: true;
            trackingMethod: best;"
      renderer="logarithmicDepthBuffer: true; antialias: true;"
      vr-mode-ui="enabled: false"
      device-orientation-permission-ui="enabled: false"
      @camera-init="onCameraInit"
      @camera-error="onCameraError"
      @loaded="onSceneLoaded"
    >
      <!-- DEBUG: Простая красная плоскость с glitch-effect -->
      <a-entity id="debug-glitch-plane"
                geometry="primitive: plane; width: 1; height: 1"
                material="color: red; side: double; opacity: 0.8"
                position="0.7 1.3 -3"
                rotation="180 180 0"
                glitch-effect="intensity: 1.0; offsetX: 0.7; offsetY: 0.6; radius: 0.5"
      </a-entity>
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
      >
        
      </a-entity>

      <a-entity camera look-controls>
        <a-entity 
          cursor="rayOrigin: mouse; fuse: false"
          position="0 0 -1"
          geometry="primitive: ring; radiusInner: 0.02; radiusOuter: 0.03"
          material="color: #CCC; shader: flat">
        </a-entity>
      </a-entity>
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
    <div class="debug-info" v-if="debugInfo">
      <p>Статус камеры: {{ debugInfo.cameraStatus }}</p>
      <p>Разрешение: {{ debugInfo.resolution }}</p>
      <p>Ошибки: {{ debugInfo.errors }}</p>
      <p>AR.js статус: {{ debugInfo.arStatus }}</p>
      <p>Последнее обновление: {{ debugInfo.lastUpdate }}</p>
      <p>Глитч статус: {{ debugInfo.glitchStatus }}</p>
      <p>Статус модели: {{ debugInfo.modelStatus }}</p>
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
import { ref, onMounted, watchEffect, nextTick } from 'vue'

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
  modelStatus: 'Модель не загружена'
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

async function loadCocoModel() {
  try {
    updateDebugInfo({ modelStatus: 'Загрузка модели...' });
    if (!window.cocoSsd) {
      await new Promise((resolve, reject) => {
        const s1 = document.createElement('script');
        s1.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs';
        s1.onload = () => {
          const s2 = document.createElement('script');
          s2.src = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd';
          s2.onload = resolve;
          s2.onerror = (e) => reject(new Error('Ошибка загрузки coco-ssd: ' + e.message));
          document.head.appendChild(s2);
        };
        s1.onerror = (e) => reject(new Error('Ошибка загрузки tfjs: ' + e.message));
        document.head.appendChild(s1);
      });
    }
    cocoModel = await window.cocoSsd.load();
    updateDebugInfo({ modelStatus: 'Модель успешно загружена' });
  } catch (error) {
    console.error('Ошибка загрузки модели coco-ssd:', error);
    updateDebugInfo({
      modelStatus: 'Ошибка загрузки модели',
      errors: `TensorFlow.js: ${error.message}`
    });
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
      // Для отладки
      if (predictions.length) {
        console.log('Predictions:', predictions);
      }
    }
  } catch (error) {
    console.error('Ошибка в detectLoop:', error);
    updateDebugInfo({
      errors: `detectLoop: ${error.message}`
    });
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
    const el = this.el;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 240;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    this.cameraTexture = new THREE.Texture(this.canvas);
    this.cameraTexture.minFilter = THREE.LinearFilter;
    this.cameraTexture.magFilter = THREE.LinearFilter;
    this.cameraTexture.format = THREE.RGBAFormat;
    this.cameraTexture.generateMipmaps = false;

    this.noVideo = false;
    this.hasVideo = false;

    // uniforms для bbox
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: this.data.intensity },
        cameraTexture: { value: this.cameraTexture },
        resolution: { value: new THREE.Vector2(this.canvas.width, this.canvas.height) },
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
          vec3 color = texture2D(cameraTexture, uv).rgb;
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

    el.addEventListener('loaded', () => {
      const mesh = el.getObject3D('mesh');
      if (mesh) {
        mesh.material = this.material;
      }
    });

    this.video = null;
    this.lastUpdate = 0;
    this.updateInterval = 1000 / 30;

    this.updateCameraTexture = () => {
      const now = performance.now();
      if (now - this.lastUpdate < this.updateInterval) return;
      this.lastUpdate = now;
      if (!this.video) {
        this.video = document.querySelector('video');
        if (!this.video) {
          this.noVideo = true;
          this.hasVideo = false;
          for (let y = 0; y < this.canvas.height; y++) {
            for (let x = 0; x < this.canvas.width; x++) {
              const r = Math.floor(Math.random() * 255);
              const g = Math.floor(Math.random() * 255);
              const b = Math.floor(Math.random() * 255);
              this.ctx.fillStyle = `rgb(${r},${g},${b})`;
              this.ctx.fillRect(x, y, 1, 1);
            }
          }
          this.cameraTexture.needsUpdate = true;
          return;
        }
      }
      if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
        this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
        this.cameraTexture.needsUpdate = true;
        this.noVideo = false;
        this.hasVideo = true;
      } else {
        this.hasVideo = false;
      }
    };
  },

  tick: function (time) {
    if (this.material) {
      this.material.uniforms.time.value = time / 1000;
      this.material.uniforms.intensity.value = this.data.intensity;
      this.material.uniforms.hasVideo.value = this.hasVideo ? 1 : 0;
      // --- Передача bbox из detectedBoxes ---
      const boxes = (window.__vueDetectedBoxes || []);
      this.material.uniforms.boxCount.value = Math.min(boxes.length, 10);
      for (let i = 0; i < 10; i++) {
        if (i < boxes.length) {
          const bbox = boxes[i].bbox || [0, 0, 0, 0];
          const [x, y, w, h] = bbox;
          this.material.uniforms.boxes.value[i] = new THREE.Vector4(
            x / this.canvas.width,
            y / this.canvas.height,
            w / this.canvas.width,
            h / this.canvas.height
          );
        } else {
          this.material.uniforms.boxes.value[i] = new THREE.Vector4(0,0,0,0);
        }
      }
      this.updateCameraTexture();
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

// Функция для отрисовки bbox
function drawOverlay() {
  const canvas = overlayCanvas.value
  const aframeCanvas = document.querySelector('a-scene canvas')
  if (!canvas || !aframeCanvas) return
  // Получаем положение и размер основного канваса A-Frame
  const rect = aframeCanvas.getBoundingClientRect()
  // Синхронизируем overlay-canvas
  canvas.style.position = 'absolute'
  canvas.style.left = rect.left + 'px'
  canvas.style.top = rect.top + 'px'
  canvas.width = rect.width
  canvas.height = rect.height
  canvas.style.width = rect.width + 'px'
  canvas.style.height = rect.height + 'px'
  // pointer-events: none уже в стилях
  const ctx = canvas.getContext('2d')
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  const scaleX = canvas.width / 1280
  const scaleY = canvas.height / 720
  detectedBoxes.value.forEach(box => {
    const [x, y, w, h] = box.bbox
    ctx.strokeStyle = '#00FF00'
    ctx.lineWidth = 3
    ctx.strokeRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY)
    ctx.font = '18px Arial'
    ctx.fillStyle = '#00FF00'
    ctx.fillText(`${box.class} (${(box.score * 100).toFixed(1)}%)`, x * scaleX + 4, y * scaleY + 20)
  })
}

// Следим за изменениями bbox и обновляем canvas
watchEffect(() => {
  nextTick(() => {
    drawOverlay()
  })
})

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