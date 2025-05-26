<template>
  <div class="ar-container">
    <!-- Canvas для прямоугольников - перемещаем его перед сценой -->
    <canvas ref="overlayCanvas" class="overlay-canvas"></canvas>
    
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
      renderer="logarithmicDepthBuffer: true; 
                antialias: true;
                alpha: true;
                precision: high;
                preserveDrawingBuffer: true;"
      vr-mode-ui="enabled: false"
      device-orientation-permission-ui="enabled: false"
      @camera-init="onCameraInit"
      @camera-error="onCameraError"
      @loaded="onSceneLoaded"
      cursor="rayOrigin: mouse"
      raycaster="objects: .clickable"
    >
      <!-- Directional light для теней -->
      <a-entity light="type: directional; castShadow: true; intensity: 0.7; color: #8CFF00" position="2 6 2"></a-entity>
      <!-- Ambient light для мягкого освещения -->
      <a-entity light="type: ambient; intensity: 0.4; color: #8CFF00"></a-entity>
      <!-- 3D ленты из bbox -->
      <!-- <a-entity ribbons-effect></a-entity> -->

      <!-- Плоскость-пол, принимающая тени -->

      
      
      <!-- Перемещаем модель после элементов эффекта, чтобы она рендерилась поверх -->
      <a-entity
        gltf-model="/models/drage.glb"
        scale="0.5 0.5 0.5"
        position="0 0 -4"
        rotation="0 90 0"
        shadow="cast: false; receive: false"
        animation="property: rotation; to: 0 450 0; loop: true; dur: 10000;"
        rendering-order="10"
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
        @model-loaded="onModelLoaded"
      ></a-entity>
      
      <a-entity
        id="placed-model"
        gltf-model="#model1"
        visible="false"
        class="clickable"
        position="0 0 -1"
        scale="0.5 0.5 0.5"
        @click="onModelClick"
        rendering-order="10"
      ></a-entity>

      <a-entity camera look-controls>
        <!--<a-entity 
          cursor="rayOrigin: mouse; fuse: false"
          position="0 0 -1"
          geometry="primitive: ring; radiusInner: 0.02; radiusOuter: 0.03"
          material="color: #8CFF00; shader: flat">
        </a-entity>-->
      </a-entity>
    </a-scene>

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

    // Установка высокого renderOrder для 3D моделей
    setTimeout(() => {
      const entities = document.querySelectorAll('a-entity[gltf-model]');
      entities.forEach(entity => {
        const mesh = entity.getObject3D('mesh');
        if (mesh) {
          // Установка высокого renderOrder для всех материалов модели
          mesh.traverse(node => {
            if (node.material) {
              if (Array.isArray(node.material)) {
                node.material.forEach(mat => {
                  mat.renderOrder = 100;
                  // Оставляем depthTest включенным
                  mat.depthTest = true;
                  // Включаем depthWrite
                  mat.depthWrite = true;
                });
              } else {
                node.material.renderOrder = 100;
                // Оставляем depthTest включенным
                node.material.depthTest = true;
                // Включаем depthWrite
                node.material.depthWrite = true;
              }
            }
          });
        }
      });
    }, 2000);

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
    
    // Проверяем, является ли устройство мобильным
    this.isMobile = window.innerWidth < 768;
    
    // Добавляем обработчик изменения размера окна
    this.handleResize = this.handleResize.bind(this);
    window.addEventListener('resize', this.handleResize);
    
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
        boxes: { value: Array(10).fill(new THREE.Vector4(0,0,0,0)) },
        isMobile: { value: this.isMobile ? 1 : 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
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
        uniform int isMobile; // 1 для мобильных устройств
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vViewPosition;

        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }
        
        float noise(vec2 st) {
          vec2 i = floor(st);
          vec2 f = fract(st);
          float a = random(i);
          float b = random(i + vec2(1.0, 0.0));
          float c = random(i + vec2(0.0, 1.0));
          float d = random(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }
        
        vec3 hologramEffect(vec2 uv, vec3 color) {
          float deviceFactor = isMobile == 1 ? 0.7 : 1.0;
          float scanlineFreq = isMobile == 1 ? 50.0 : 100.0;
          float scanline = sin(uv.y * scanlineFreq + time * 5.0) * 0.03 * deviceFactor + 0.03;
          float noiseFreq1 = isMobile == 1 ? 50.0 : 100.0;
          float noiseFreq2 = isMobile == 1 ? 25.0 : 50.0;
          float noiseIntensity = isMobile == 1 ? 0.07 : 0.1;
          float noise1 = noise(uv * noiseFreq1 + time) * noiseIntensity;
          float noise2 = noise(uv * noiseFreq2 - time * 0.5) * noiseIntensity;
          float glitchX = step(0.98, sin(time * 9.0 + uv.y * 50.0)) * 0.02 * sin(time * 4.0) * deviceFactor;
          vec2 offset = vec2(
            noise1 * 0.02 + glitchX,
            noise2 * 0.01
          ) * deviceFactor;
          float rgbOffset = isMobile == 1 ? 0.7 : 1.0;
          vec3 rgbOffsetColor;
          if (isMobile == 1) {
            rgbOffsetColor = vec3(
              texture2D(cameraTexture, vec2(uv.x + offset.x, 1.0 - (uv.y + offset.y))).r,
              texture2D(cameraTexture, vec2(uv.x, 1.0 - uv.y)).g,
              texture2D(cameraTexture, vec2(uv.x - offset.x, 1.0 - (uv.y - offset.y))).b
            );
          } else {
            rgbOffsetColor = vec3(
              texture2D(cameraTexture, vec2(uv.x + offset.x * 1.4, 1.0 - (uv.y + offset.y))).r,
              texture2D(cameraTexture, vec2(uv.x + offset.x * 0.5, 1.0 - (uv.y - offset.y * 0.5))).g,
              texture2D(cameraTexture, vec2(uv.x, 1.0 - uv.y)).b
            );
          }
          vec3 hologram = rgbOffsetColor + vec3(0.1, 0.3, 0.6) * scanline + vec3(noise1 + noise2);
          float edge = (1.0 - abs(vNormal.z)) * 0.3;
          hologram += vec3(0.0, 0.5, 1.0) * edge * (sin(time * 2.0) * 0.2 + 0.3);
          return hologram;
        }
        
        bool inBox(vec2 uv, vec4 box) {
          return uv.x > box.x && uv.x < (box.x + box.z) && uv.y > box.y && uv.y < (box.y + box.w);
        }
        
        void main() {
          vec2 uv = vUv;
          bool distorted = false;
          float glitchLine = 0.0;
          float glitchAlpha = 1.0;
          float glitchRGB = 0.0;
          vec3 color = vec3(0.0);
          for (int i = 0; i < 10; i++) {
            if (i >= boxCount) break;
            if (inBox(uv, boxes[i])) {
              // --- ГОРИЗОНТАЛЬНЫЕ РАЗРЫВЫ ---
              float lineRand = random(vec2(uv.y * 100.0, time * 0.5));
              if (lineRand > 0.7) {
                uv.x += (lineRand - 0.7) * 0.2 * sin(time * 2.0 + uv.y * 100.0);
                glitchLine = 1.0;
              }
              // --- ПРОЗРАЧНЫЕ ПОЛОСЫ ---
              float alphaRand = random(vec2(uv.y * 200.0, time));
              if (alphaRand > 0.85) {
                glitchAlpha = 0.0;
              }
              // --- RGB-сдвиг ---
              float rgbRand = random(vec2(uv.y * 300.0, time * 0.7));
              if (rgbRand > 0.6) {
                glitchRGB = (rgbRand - 0.6) * 0.03;
              }
              // --- Цветовой шум ---
              float colorNoise = (random(uv * 200.0 + time * 2.0) - 0.5) * 0.2;
              // --- Применяем искажения ---
              vec3 baseColor = vec3(
                texture2D(cameraTexture, vec2(uv.x + glitchRGB, 1.0 - uv.y)).r + colorNoise,
                texture2D(cameraTexture, vec2(uv.x, 1.0 - uv.y)).g + colorNoise,
                texture2D(cameraTexture, vec2(uv.x - glitchRGB, 1.0 - uv.y)).b + colorNoise
              );
              color = hologramEffect(uv, baseColor);
              distorted = true;
            }
          }
          if (distorted) {
            float alpha = isMobile == 1 ? (0.75 + sin(time * 3.0) * 0.15) : (0.85 + sin(time * 3.0) * 0.15);
            gl_FragColor = vec4(color, alpha * glitchAlpha);
          } else {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
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

  handleResize: function() {
    // Обновляем флаг мобильного устройства при изменении размера окна
    this.isMobile = window.innerWidth < 768;
    if (this.material) {
      this.material.uniforms.isMobile.value = this.isMobile ? 1 : 0;
    }
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
          let [x, y, w, h] = bbox;
          
          // Уменьшаем ширину на 5% слева и 5% справа
          const widthReduction = w * 0.05;
          x += widthReduction; // смещаем влево на 5% от ширины
          w -= widthReduction * 2; // уменьшаем ширину на 10% (5% слева + 5% справа)
          
          // Корректировка смещения в зависимости от устройства
          if (this.isMobile) {
            // На мобильных устройствах меньшее смещение
            x -= 30;
          } else {
            // На десктопе оставляем прежнее смещение
            x -= 120;
          }
          
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
    window.removeEventListener('resize', this.handleResize);
  }
});

// --- Синхронизация detectedBoxes для glitch-effect ---
window.__vueDetectedBoxes = [];
watchEffect(() => {
  // Берем только первый распознанный объект
  const firstObject = detectedBoxes.value.length > 0 ? [detectedBoxes.value[0]] : [];
  window.__vueDetectedBoxes = firstObject;
});

// Компонент для установки высокого порядка отрисовки
AFRAME.registerComponent('rendering-order', {
  schema: {
    default: 0
  },
  
  init: function() {
    this.applyRenderOrder();
  },
  
  update: function() {
    this.applyRenderOrder();
  },
  
  applyRenderOrder: function() {
    const mesh = this.el.getObject3D('mesh');
    if (!mesh) {
      // Если сетка еще не загружена, ждем ее загрузки
      this.el.addEventListener('model-loaded', () => this.applyRenderOrder(), {once: true});
      return;
    }
    
    const orderValue = parseInt(this.data);
    mesh.traverse(node => {
      if (node.material) {
        if (Array.isArray(node.material)) {
          node.material.forEach(mat => {
            mat.renderOrder = orderValue;
            // Не отключаем depthTest, чтобы предотвратить артефакты
            mat.depthTest = true;
            // Устанавливаем depthWrite для корректного рендеринга
            mat.depthWrite = true;
            // Не делаем все материалы прозрачными
            if (mat.transparent) {
              mat.needsUpdate = true;
            }
          });
        } else {
          node.material.renderOrder = orderValue;
          // Не отключаем depthTest, чтобы предотвратить артефакты
          node.material.depthTest = true;
          // Устанавливаем depthWrite для корректного рендеринга
          node.material.depthWrite = true;
          // Не делаем все материалы прозрачными
          if (node.material.transparent) {
            node.material.needsUpdate = true;
          }
        }
      }
    });
  }
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
  canvas.style.zIndex = 3
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
  
  // Определяем, находимся ли мы на мобильном устройстве
  const isMobile = window.innerWidth < 768;

  detectedBoxes.value.forEach((box, boxIdx) => { // максимум 1 объект
    // Получаем исходные координаты и размеры
    let [x, y, w, h] = box.bbox;
    
    // Корректировка смещения в зависимости от устройства
    if (isMobile) {
      // На мобильных устройствах меньшее смещение
      x += 330;
    } else {
      // На десктопе оставляем прежнее смещение
      x -= 120;
    }
    
    if (video && video.readyState === 4) {
      // Добавляем пространственность через неравномерную деформацию
      // и изменение размера полос в зависимости от предполагаемой "глубины"
      
      // Создаем градиент прозрачности по краям для эффекта объема
      ctx.save();
      
      // Рисуем линии с искажениями
      drawGlitchOnFace(ctx, video, x, y, w, h, t, scaleX, scaleY, x + w/2, y + h/2, 'front', isMobile);
      
      // Восстанавливаем контекст
      ctx.restore();
      ctx.globalAlpha = 1.0;
    }
  });
}

// Функция для рисования эффекта глюка на указанной грани
function drawGlitchOnFace(ctx, video, x, y, width, height, time, scaleX, scaleY, centerX, centerY, face, isMobile = false) {
  const t = time;
  
  // Настраиваем интенсивность эффектов в зависимости от устройства
  const deviceFactor = isMobile ? 0.7 : 1;
  const intensity = deviceFactor;
  
  // Параметры перспективы
  const perspectiveOriginX = window.innerWidth / 2;
  const perspectiveOriginY = window.innerHeight / 2;
  const maxPerspectiveShift = 20 * deviceFactor;
  
  // Вычисляем относительное положение объекта от центра экрана
  const relativeX = (centerX - perspectiveOriginX) / perspectiveOriginX;
  const relativeY = (centerY - perspectiveOriginY) / perspectiveOriginY;
  
  // Создаем эффект параллакса на основе положения
  const parallaxX = relativeX * maxPerspectiveShift;
  const parallaxY = relativeY * maxPerspectiveShift;
  
  // Адаптивный шаг для строк эффекта
  const lineStep = isMobile ? 5 : 2;
  
  // Функция искажения с учетом 3D эффекта
  const distortionFunction = (i, lineY) => {
    // Вычисляем расстояние от центра для создания эффекта глубины
    const distFromCenterX = (x + width/2 - centerX) / width;
    const distFromCenterY = (lineY - centerY) / height;
    const distFromCenter = Math.sqrt(distFromCenterX * distFromCenterX + distFromCenterY * distFromCenterY);
    
    // Создаем эффект глубины
    const depthFactor = 1 - distFromCenter * 0.5;
    
    // Добавляем волновой эффект для создания ощущения объема
    const waveX = Math.sin(t * 2 + lineY * 0.05) * 15 * intensity * depthFactor;
    const waveY = Math.cos(t * 3 + lineY * 0.03) * 10 * intensity * depthFactor;
    
    // Добавляем случайное смещение с учетом глубины
    const randomX = (Math.random() - 0.5) * 30 * intensity * depthFactor;
    const randomY = (Math.random() - 0.5) * 20 * intensity * depthFactor;
    
    // Комбинируем все эффекты смещения
    const totalOffsetX = waveX + randomX + parallaxX * depthFactor;
    const totalOffsetY = waveY + randomY + parallaxY * depthFactor;
    
    // Создаем пульсацию прозрачности для эффекта голограммы
    const pulseAlpha = 0.6 + 0.2 * Math.sin(t * 4 + distFromCenter * 5);
    
    // Добавляем шум к прозрачности для создания эффекта помех
    const noiseAlpha = Math.random() * 0.3 * depthFactor;
    
    return {
      offsetX: totalOffsetX,
      offsetY: totalOffsetY,
      alpha: (pulseAlpha + noiseAlpha) * intensity * depthFactor,
      depthFactor: depthFactor
    };
  };
  
  // Базовая интенсивность RGB-сдвига
  const baseRgbSplit = 8 * intensity;
  
  // Рисуем линии с искажениями
  for (let i = 0; i < height; i += lineStep) {
    const lineY = y + i;
    const lineHeight = lineStep;
    
    // Получаем параметры искажения для текущей линии
    const distortion = distortionFunction(i, lineY);
    
    // Пропускаем некоторые строки для оптимизации на мобильных
    if (isMobile && i % 10 !== 0) continue;
    
    // Вычисляем RGB-сдвиг с учетом глубины
    const rgbSplitIntensity = baseRgbSplit * distortion.depthFactor;
    
    // Применяем эффект RGB-сдвига с переменной интенсивностью
    if (i % (isMobile ? 24 : 12) === 0) {
      // Добавляем волновое искажение для RGB каналов
      const rgbWaveX = Math.sin(t * 3 + lineY * 0.02) * rgbSplitIntensity;
      const rgbWaveY = Math.cos(t * 2 + lineY * 0.03) * rgbSplitIntensity;
      
      // Красный канал
      ctx.globalAlpha = distortion.alpha * 0.7;
      ctx.drawImage(
        video,
        x, lineY, width, lineHeight,
        (x + distortion.offsetX + rgbWaveX) * scaleX, 
        (lineY + distortion.offsetY + rgbWaveY) * scaleY, 
        width * scaleX * (1 + distortion.depthFactor * 0.05), 
        lineHeight * scaleY
      );
      
      // Зелёный канал
      ctx.globalAlpha = distortion.alpha * 0.8;
      ctx.drawImage(
        video,
        x, lineY, width, lineHeight,
        (x + distortion.offsetX) * scaleX, 
        (lineY + distortion.offsetY) * scaleY, 
        width * scaleX, 
        lineHeight * scaleY
      );
      
      // Синий канал
      ctx.globalAlpha = distortion.alpha * 0.7;
      ctx.drawImage(
        video,
        x, lineY, width, lineHeight,
        (x + distortion.offsetX - rgbWaveX) * scaleX, 
        (lineY + distortion.offsetY - rgbWaveY) * scaleY, 
        width * scaleX * (1 - distortion.depthFactor * 0.05), 
        lineHeight * scaleY
      );
    } else {
      // Обычная смазанная полоса с эффектом глубины
      ctx.globalAlpha = distortion.alpha * 0.8;
      ctx.drawImage(
        video,
        x, lineY, width, lineHeight,
        (x + distortion.offsetX) * scaleX, 
        (lineY + distortion.offsetY) * scaleY, 
        width * scaleX * (1 + (Math.random() - 0.5) * 0.1 * distortion.depthFactor), 
        lineHeight * scaleY
      );
    }
  }
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

function onModelLoaded(evt) {
  console.log('Model loaded:', evt);
  updateDebugInfo({
    modelStatus: 'Модель успешно загружена'
  });
  
  // Настраиваем материалы загруженной модели
  const entity = evt.detail.model;
  if (entity) {
    setTimeout(() => {
      entity.traverse(node => {
        if (node.material) {
          if (Array.isArray(node.material)) {
            node.material.forEach(mat => {
              mat.renderOrder = 100;
              mat.depthTest = true;
              mat.depthWrite = true;
              mat.needsUpdate = true;
            });
          } else {
            node.material.renderOrder = 100;
            node.material.depthTest = true;
            node.material.depthWrite = true;
            node.material.needsUpdate = true;
          }
        }
      });
    }, 100);
  }
}

// --- ribbons-effect: 3D ленты из bbox ---
AFRAME.registerComponent('ribbons-effect', {
  schema: {},
  init: function () {
    this.ribbonMesh = null;
    this.lastBBox = '';
  },
  tick: function () {
    const boxes = window.__vueDetectedBoxes || [];
    const video = document.querySelector('video');
    if (boxes.length && video && video.readyState === 4) {
      const bboxStr = boxes[0].bbox.toString();
      if (!this.ribbonMesh || this.lastBBox !== bboxStr) {
        if (this.ribbonMesh) {
          this.el.sceneEl.object3D.remove(this.ribbonMesh);
          this.ribbonMesh.geometry.dispose();
          if (this.ribbonMesh.material.map) this.ribbonMesh.material.map.dispose();
          this.ribbonMesh.material.dispose();
        }
        // import('./ar-ribbons.js').then(({ createRibbonFromBBox }) => {
        //   this.ribbonMesh = createRibbonFromBBox(boxes[0].bbox, video, this.el.sceneEl.object3D);
        //   this.lastBBox = bboxStr;
        // });
      }
    } else if (this.ribbonMesh) {
      this.el.sceneEl.object3D.remove(this.ribbonMesh);
      this.ribbonMesh.geometry.dispose();
      if (this.ribbonMesh.material.map) this.ribbonMesh.material.map.dispose();
      this.ribbonMesh.material.dispose();
      this.ribbonMesh = null;
      this.lastBBox = '';
    }
  },
  remove: function () {
    if (this.ribbonMesh) {
      this.el.sceneEl.object3D.remove(this.ribbonMesh);
      this.ribbonMesh.geometry.dispose();
      if (this.ribbonMesh.material.map) this.ribbonMesh.material.map.dispose();
      this.ribbonMesh.material.dispose();
      this.ribbonMesh = null;
    }
  }
});

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
  z-index: 5;
}

:deep(.a-entity[gltf-model]) {
  z-index: 15 !important;
  pointer-events: auto !important;
  transform-style: preserve-3d;
  backface-visibility: visible;
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

/* Адаптивность для overlay-canvas */
.overlay-canvas {
  position: absolute;
  top: 0;
  left: 0;
  width: 100% !important;
  height: 100% !important;
  pointer-events: none;
  z-index: 3;
}

@media (max-width: 767px) {
  .debug-info {
    font-size: 10px;
    max-width: 50%;
    opacity: 0.7;
  }
}
</style> 