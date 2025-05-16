<template>
  <div class="ar-container">
    <!-- Canvas для прямоугольников - перемещаем его перед сценой -->
    <canvas ref="overlayCanvas" class="overlay-canvas"></canvas>
    
    <!-- Виртуальный голографический экран - теперь полный параллелепипед -->
    <div class="hologram-frame" ref="hologramFrame">
      <div class="scan-line"></div>
      <div class="holo-grid"></div>
      <!-- Передняя грань -->
      <div class="front-face"></div>
      <!-- Соединительные линии для создания параллелепипеда -->
      <div class="corner-line top-left"></div>
      <div class="corner-line top-right"></div>
      <div class="corner-line bottom-left"></div>
      <div class="corner-line bottom-right"></div>
      <!-- Соединительные линии между передней и задней гранями -->
      <div class="connector-line top-left-connector"></div>
      <div class="connector-line top-right-connector"></div>
      <div class="connector-line bottom-left-connector"></div>
      <div class="connector-line bottom-right-connector"></div>
      <!-- Задняя грань параллелепипеда -->
      <div class="back-face"></div>
      <!-- Боковые грани параллелепипеда -->
      <div class="side-face left-face"></div>
      <div class="side-face right-face"></div>
      <div class="side-face top-face"></div>
      <div class="side-face bottom-face"></div>
    </div>
    
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
      <a-entity light="type: directional; castShadow: true; intensity: 0.7; color: #fff" position="2 6 2"></a-entity>
      <!-- Ambient light для мягкого освещения -->
      <a-entity light="type: ambient; intensity: 0.4; color: #888"></a-entity>

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
        <a-entity 
          cursor="rayOrigin: mouse; fuse: false"
          position="0 0 -1"
          geometry="primitive: ring; radiusInner: 0.02; radiusOuter: 0.03"
          material="color: #CCC; shader: flat">
        </a-entity>
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
        
        // Шум Перлина для создания волнистого эффекта
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
        
        // Функция для создания эффекта голограммы
        vec3 hologramEffect(vec2 uv, vec3 color) {
          // Настраиваем интенсивность эффектов в зависимости от устройства
          float deviceFactor = isMobile == 1 ? 0.7 : 1.0;
          
          // Создаем линии как у голограммы - меньше линий для мобильных
          float scanlineFreq = isMobile == 1 ? 50.0 : 100.0;
          float scanline = sin(uv.y * scanlineFreq + time * 5.0) * 0.03 * deviceFactor + 0.03;
          
          // Создаем шумы и помехи - упрощаем для мобильных
          float noiseFreq1 = isMobile == 1 ? 50.0 : 100.0;
          float noiseFreq2 = isMobile == 1 ? 25.0 : 50.0;
          float noiseIntensity = isMobile == 1 ? 0.07 : 0.1;
          float noise1 = noise(uv * noiseFreq1 + time) * noiseIntensity;
          float noise2 = noise(uv * noiseFreq2 - time * 0.5) * noiseIntensity;
          
          // Смещение по горизонтали для glitch-эффекта
          float glitchX = step(0.98, sin(time * 9.0 + uv.y * 50.0)) * 0.02 * sin(time * 4.0) * deviceFactor;
          
          // Искажаем UV координаты для создания объемного эффекта
          vec2 offset = vec2(
            noise1 * 0.02 + glitchX,
            noise2 * 0.01
          ) * deviceFactor;
          
          // Добавляем RGB-смещение для хроматической аберрации
          float rgbOffset = isMobile == 1 ? 0.7 : 1.0;
          vec3 rgbOffsetColor;
          
          if (isMobile == 1) {
            // Упрощенный вариант для мобильных
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
          
          // Добавляем эффект голограммы
          vec3 hologram = rgbOffsetColor + vec3(0.1, 0.3, 0.6) * scanline + vec3(noise1 + noise2);
          
          // Добавляем эффект границ голограммы
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
          
          for (int i = 0; i < 10; i++) {
            if (i >= boxCount) break;
            if (inBox(uv, boxes[i])) {
              // Эффект 3D-пространственного искажения
              float distDepth = sin(vViewPosition.z * 0.1 + time) * 0.1;
              
              // Уменьшаем искажение для мобильных устройств
              float deviceFactor = isMobile == 1 ? 0.5 : 1.0;
              
              float distortionAmount = 0.05 * sin(time * 3.0 + uv.y * 20.0) * deviceFactor;
              
              // Имитация объемности через искажение UV
              uv.x += distortionAmount * sin(uv.y * 40.0 + time * 2.0 + distDepth);
              uv.y += distortionAmount * 0.7 * cos(uv.x * 40.0 + time * 2.0 - distDepth);
              
              // Вычисляем глубину для эффекта объема
              float depth = noise(uv * 5.0 + time * 0.2) * 0.1 + 0.9;
              
              distorted = true;
            }
          }
          
          // Применяем голографический эффект
          vec3 color;
          if (distorted) {
            if (hasVideo == 1) {
              vec3 baseColor = texture2D(cameraTexture, vec2(uv.x, 1.0 - uv.y)).rgb;
              color = hologramEffect(uv, baseColor);
            } else {
              // Fallback: голографический шум вне bbox если нет камеры
              color = vec3(random(uv + time), random(uv + time * 2.0), random(uv + time * 3.0));
              color = hologramEffect(uv, color);
              gl_FragColor = vec4(color, 0.7);
              return;
            }
            
            // Добавляем мерцание краев
            float edge = 0.05;
            if(any(lessThan(uv, vec2(edge))) || any(greaterThan(uv, vec2(1.0 - edge)))) {
              color += vec3(0.0, 0.5, 1.0) * sin(time * 10.0) * 0.3;
            }
            
            // Корректируем прозрачность для мобильных
            float alpha = isMobile == 1 ? (0.75 + sin(time * 3.0) * 0.15) : (0.85 + sin(time * 3.0) * 0.15);
            gl_FragColor = vec4(color, alpha);
          } else if (hasVideo == 0) {
            // Полностью прозрачный вне области эффекта
            gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
          } else {
            // Полностью прозрачный вне области эффекта
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
const hologramFrame = ref(null)
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

// Синхронизация голографического экрана
function syncHologramFrame() {
  const frame = hologramFrame.value;
  if (!frame || !lastRect || detectedBoxes.value.length === 0) return;
  
  const box = detectedBoxes.value[0];
  if (!box || !box.bbox) return;
  
  let [x, y, w, h] = box.bbox;
  
  // Определяем, находимся ли мы на мобильном устройстве
  const isMobile = window.innerWidth < 768;
  
  // Применяем те же преобразования, что и к эффекту глюка
  const widthReduction = w * 0.05;
  x += widthReduction;
  w -= widthReduction * 2;
  
  // Корректировка смещения в зависимости от устройства
  if (isMobile) {
    // На мобильных устройствах меньшее смещение
    x -= 30;
  } else {
    // На десктопе оставляем прежнее смещение
    x -= 120;
  }
  
  // Добавляем 3D эффект через CSS трансформации
  const t = glitchTime / 1000;
  const scaleX = lastRect.width / 1280;
  const scaleY = lastRect.height / 720;
  
  // Позиционируем рамку
  frame.style.position = 'fixed';
  frame.style.left = (lastRect.left + x * scaleX - 10) + 'px';
  frame.style.top = (lastRect.top + y * scaleY - 10) + 'px';
  frame.style.width = (w * scaleX + 20) + 'px';
  frame.style.height = (h * scaleY + 20) + 'px';
  
  // Адаптивные трансформации для эффекта 3D
  const rotationFactor = isMobile ? 0.5 : 1; // Уменьшаем вращение на мобильных устройствах
  const rotX = 2 + Math.sin(t * 0.5) * 1 * rotationFactor;
  const rotY = -2 + Math.cos(t * 0.7) * 1 * rotationFactor;
  const transZ = Math.sin(t * 0.3) * 5 * rotationFactor;
  
  frame.style.transform = `
    perspective(800px) 
    rotateX(${rotX}deg) 
    rotateY(${rotY}deg)
    translateZ(${transZ}px)
  `;
  
  // Динамическая тень
  const shadowColor = `rgba(0, 195, 255, ${0.6 + 0.2 * Math.sin(t * 2)})`;
  const shadowSize = 8 + 4 * Math.sin(t * 3);
  frame.style.boxShadow = `0 0 ${shadowSize}px ${shadowColor}, inset 0 0 15px rgba(0, 195, 255, 0.5)`;
  
  // Меняем цвет рамки со временем
  const borderColor = `rgba(0, ${190 + 30 * Math.sin(t * 4)}, 255, ${0.6 + 0.3 * Math.sin(t * 1.5)})`;
  frame.style.borderColor = borderColor;
  
  // Анимация параллелепипеда
  
  // Получаем дочерние элементы
  const frontFace = frame.querySelector('.front-face');
  const backFace = frame.querySelector('.back-face');
  const leftFace = frame.querySelector('.side-face.left-face');
  const rightFace = frame.querySelector('.side-face.right-face');
  const topFace = frame.querySelector('.side-face.top-face');
  const bottomFace = frame.querySelector('.side-face.bottom-face');
  
  const topLeftCorner = frame.querySelector('.corner-line.top-left');
  const topRightCorner = frame.querySelector('.corner-line.top-right');
  const bottomLeftCorner = frame.querySelector('.corner-line.bottom-left');
  const bottomRightCorner = frame.querySelector('.corner-line.bottom-right');
  
  const topLeftConnector = frame.querySelector('.connector-line.top-left-connector');
  const topRightConnector = frame.querySelector('.connector-line.top-right-connector');
  const bottomLeftConnector = frame.querySelector('.connector-line.bottom-left-connector');
  const bottomRightConnector = frame.querySelector('.connector-line.bottom-right-connector');
  
  // Глубина параллелепипеда с анимацией
  const depth = 40 + 10 * Math.sin(t * 0.8);
  
  if (backFace) {
    // Анимация глубины задней грани
    backFace.style.transform = `perspective(800px) translateZ(-${depth}px)`;
    
    // Изменяем прозрачность и цвет в зависимости от глубины
    const opacity = 0.3 + 0.1 * Math.sin(t * 1.2);
    const blueVal = 155 + 20 * Math.sin(t * 2);
    backFace.style.opacity = opacity;
    backFace.style.borderColor = `rgba(0, ${blueVal}, 255, ${opacity + 0.1})`;
    
    // Анимируем глюк на задней грани
    const glitchIntensity = 0.5 + 0.3 * Math.sin(t * 2.5);
    const glitchOffset = 2 + Math.sin(t * 5) * 2;
    const glitchClip = `polygon(
      ${glitchOffset}% 0%, 
      100% 0%, 
      100% ${100 - glitchOffset * 0.8}%, 
      ${100 - glitchOffset}% 100%, 
      0% 100%, 
      0% ${glitchOffset * 0.8}%
    )`;
    backFace.style.clipPath = glitchClip;
  }
  
  // Анимация углов фронтальной рамки
  const cornerDepth = 30 + 10 * Math.sin(t * 0.9);
  if (topLeftCorner) {
    topLeftCorner.style.transform = `perspective(800px) translate3d(-20px, -20px, ${cornerDepth}px)`;
  }
  if (topRightCorner) {
    topRightCorner.style.transform = `perspective(800px) translate3d(20px, -20px, ${cornerDepth}px)`;
  }
  if (bottomLeftCorner) {
    bottomLeftCorner.style.transform = `perspective(800px) translate3d(-20px, 20px, ${cornerDepth}px)`;
  }
  if (bottomRightCorner) {
    bottomRightCorner.style.transform = `perspective(800px) translate3d(20px, 20px, ${cornerDepth}px)`;
  }
  
  // Анимация соединительных линий
  const connectorHeight = 30 + 10 * Math.sin(t * 1.5);
  if (topLeftConnector) {
    topLeftConnector.style.height = `${depth}px`;
    topLeftConnector.style.transform = `perspective(800px) rotateX(${15 + 5 * Math.sin(t)}deg) rotateY(${-15 - 5 * Math.cos(t)}deg)`;
  }
  if (topRightConnector) {
    topRightConnector.style.height = `${depth}px`;
    topRightConnector.style.transform = `perspective(800px) rotateX(${15 + 5 * Math.sin(t + 0.5)}deg) rotateY(${15 + 5 * Math.cos(t + 0.5)}deg)`;
  }
  if (bottomLeftConnector) {
    bottomLeftConnector.style.height = `${depth}px`;
    bottomLeftConnector.style.transform = `perspective(800px) rotateX(${-15 - 5 * Math.sin(t + 1)}deg) rotateY(${-15 - 5 * Math.cos(t + 1)}deg)`;
  }
  if (bottomRightConnector) {
    bottomRightConnector.style.height = `${depth}px`;
    bottomRightConnector.style.transform = `perspective(800px) rotateX(${-15 - 5 * Math.sin(t + 1.5)}deg) rotateY(${15 + 5 * Math.cos(t + 1.5)}deg)`;
  }
  
  // Анимация боковых граней
  if (leftFace) {
    leftFace.style.height = '100%';
    leftFace.style.width = `${depth}px`;
    leftFace.style.transform = `rotateY(90deg) translateZ(-${depth/2}px)`;
    leftFace.style.opacity = 0.3 + 0.2 * Math.sin(t * 1.1);
    
    // Добавляем эффект глюка на левой грани
    const glitchOpacity = 0.3 + 0.2 * Math.sin(t * 3);
    const glitchColor = 155 + 40 * Math.sin(t * 2.5);
    leftFace.style.backgroundImage = `
      linear-gradient(
        ${90 + 5 * Math.sin(t)}deg, 
        rgba(0, ${glitchColor}, 255, ${glitchOpacity}) 0%,
        rgba(0, ${glitchColor + 30}, 255, 0) 50%,
        rgba(0, ${glitchColor}, 255, ${glitchOpacity}) 100%
      )
    `;
  }
  
  if (rightFace) {
    rightFace.style.height = '100%';
    rightFace.style.width = `${depth}px`;
    rightFace.style.transform = `rotateY(-90deg) translateZ(-${depth/2}px)`;
    rightFace.style.opacity = 0.3 + 0.2 * Math.sin(t * 1.3 + 0.5);
    
    // Добавляем эффект глюка на правой грани
    const glitchOpacity = 0.3 + 0.2 * Math.sin(t * 3 + 0.5);
    const glitchColor = 155 + 40 * Math.sin(t * 2.5 + 0.5);
    rightFace.style.backgroundImage = `
      linear-gradient(
        ${90 + 5 * Math.sin(t + 1)}deg, 
        rgba(0, ${glitchColor}, 255, ${glitchOpacity}) 0%,
        rgba(0, ${glitchColor + 30}, 255, 0) 50%,
        rgba(0, ${glitchColor}, 255, ${glitchOpacity}) 100%
      )
    `;
  }
  
  if (topFace) {
    topFace.style.width = '100%';
    topFace.style.height = `${depth}px`;
    topFace.style.transform = `rotateX(90deg) translateZ(-${depth/2}px)`;
    topFace.style.opacity = 0.3 + 0.2 * Math.sin(t * 1.5 + 1);
    
    // Добавляем эффект глюка на верхней грани
    const glitchOpacity = 0.3 + 0.2 * Math.sin(t * 3 + 1);
    const glitchColor = 155 + 40 * Math.sin(t * 2.5 + 1);
    topFace.style.backgroundImage = `
      linear-gradient(
        ${0 + 5 * Math.sin(t + 1.5)}deg, 
        rgba(0, ${glitchColor}, 255, ${glitchOpacity}) 0%,
        rgba(0, ${glitchColor + 30}, 255, 0) 50%,
        rgba(0, ${glitchColor}, 255, ${glitchOpacity}) 100%
      )
    `;
  }
  
  if (bottomFace) {
    bottomFace.style.width = '100%';
    bottomFace.style.height = `${depth}px`;
    bottomFace.style.transform = `rotateX(-90deg) translateZ(-${depth/2}px)`;
    bottomFace.style.opacity = 0.3 + 0.2 * Math.sin(t * 1.7 + 1.5);
    
    // Добавляем эффект глюка на нижней грани
    const glitchOpacity = 0.3 + 0.2 * Math.sin(t * 3 + 1.5);
    const glitchColor = 155 + 40 * Math.sin(t * 2.5 + 1.5);
    bottomFace.style.backgroundImage = `
      linear-gradient(
        ${0 + 5 * Math.sin(t + 2)}deg, 
        rgba(0, ${glitchColor}, 255, ${glitchOpacity}) 0%,
        rgba(0, ${glitchColor + 30}, 255, 0) 50%,
        rgba(0, ${glitchColor}, 255, ${glitchOpacity}) 100%
      )
    `;
  }
  
  // Анимация передней грани
  if (frontFace) {
    const frontOpacity = 0.6 + 0.2 * Math.sin(t * 1.1);
    frontFace.style.opacity = frontOpacity;
    
    // Добавляем эффект глюка на передней грани
    const glitchX = Math.sin(t * 5) * 5;
    const glitchY = Math.cos(t * 7) * 3;
    frontFace.style.transform = `translateZ(1px) translate(${glitchX}px, ${glitchY}px)`;
    
    // Анимируем цвет границы
    const glowColor = 195 + 20 * Math.sin(t * 3);
    frontFace.style.borderColor = `rgba(0, ${glowColor}, 255, ${frontOpacity + 0.2})`;
  }
}

function drawOverlay() {
  syncOverlayCanvas();
  syncHologramFrame();
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
    
    // Уменьшаем ширину на 5% слева и 5% справа
    const widthReduction = w * 0.05;
   // x += widthReduction; // смещаем влево на 5% от ширины
   // w -= widthReduction * 2; // уменьшаем ширину на 10% (5% слева + 5% справа)
    
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
      
      // Рисуем голографическую рамку
      const borderWidth = 4;
      const holoBorderColor = `rgba(0, 160, 255, ${0.4 + 0.3 * Math.sin(t * 4)})`;
      ctx.strokeStyle = holoBorderColor;
      ctx.lineWidth = borderWidth;
      ctx.strokeRect((x - borderWidth/2) * scaleX, (y - borderWidth/2) * scaleY, 
                    (w + borderWidth) * scaleX, (h + borderWidth) * scaleY);
      
      // Эффект объемного проекционного экрана
      // Создаем небольшую перспективную деформацию
      const perspective = 0.1 + 0.05 * Math.sin(t * 2);
      const centerX = x + w/2;
      const centerY = y + h/2;
      
      // Получаем глубину параллелепипеда - адаптивная для мобильных
      const depthFactor = isMobile ? 0.6 : 1;
      const depth = (40 + 10 * Math.sin(t * 0.8)) * depthFactor;
      
      // Рисуем линии с переменной высотой для эффекта объема на передней грани
      drawGlitchOnFace(ctx, video, x, y, w, h, t, scaleX, scaleY, centerX, centerY, 'front', isMobile);
      
      // Рисуем эффекты на левой грани
      const leftX = x - depth * 0.7;
      drawGlitchOnFace(ctx, video, leftX, y, depth * 0.7, h, t, scaleX, scaleY, centerX, centerY, 'left', isMobile);
      
      // Рисуем эффекты на правой грани
      const rightX = x + w;
      drawGlitchOnFace(ctx, video, rightX, y, depth * 0.7, h, t, scaleX, scaleY, centerX, centerY, 'right', isMobile);
      
      // Рисуем эффекты на верхней грани
      const topY = y - depth * 0.4;
      drawGlitchOnFace(ctx, video, x, topY, w, depth * 0.4, t, scaleX, scaleY, centerX, centerY, 'top', isMobile);
      
      // Рисуем эффекты на нижней грани
      const bottomY = y + h;
      drawGlitchOnFace(ctx, video, x, bottomY, w, depth * 0.4, t, scaleX, scaleY, centerX, centerY, 'bottom', isMobile);
      
      // Добавляем мерцающие частицы для эффекта голограммы
      drawHolographicParticles(ctx, x, y, w, h, depth, t, scaleX, scaleY, isMobile);
      
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
  
  const faceIntensity = {
    'front': 1.0 * deviceFactor,
    'left': 0.7 * deviceFactor,
    'right': 0.7 * deviceFactor,
    'top': 0.6 * deviceFactor,
    'bottom': 0.6 * deviceFactor,
    'back': 0.5 * deviceFactor
  };
  
  const intensity = faceIntensity[face] || 0.5 * deviceFactor;
  
  // Для боковых граней используем другие шаблоны искажения
  let distortionFunction;
  let rgbSplitIntensity;
  
  // Адаптивный шаг для строк эффекта
  const lineStep = isMobile ? 5 : 3; // Увеличиваем шаг на мобильных для оптимизации
  
  switch(face) {
    case 'left':
    case 'right':
      // Горизонтальные полосы для боковых граней
      distortionFunction = (i, lineY) => {
        return {
          offsetX: (Math.random() - 0.5) * 20 * intensity,
          offsetY: Math.sin(lineY * 0.2 + t * 3) * 3 * intensity,
          alpha: 0.5 * intensity + 0.2 * Math.sin(t * 2 + i * 0.1)
        };
      };
      rgbSplitIntensity = 4 * intensity;
      break;
      
    case 'top':
    case 'bottom':
      // Вертикальные полосы для верхней и нижней граней
      distortionFunction = (i, lineY) => {
        return {
          offsetX: Math.sin(lineY * 0.5 + t * 2) * 5 * intensity,
          offsetY: (Math.random() - 0.5) * 10 * intensity,
          alpha: 0.4 * intensity + 0.3 * Math.sin(t * 3 + i * 0.2)
        };
      };
      rgbSplitIntensity = 3 * intensity;
      break;
      
    default: // front и back
      // Стандартное искажение для передней и задней граней
      distortionFunction = (i, lineY) => {
        const distFromCenter = Math.abs(lineY - centerY) / (height/2);
        const depthFactor = 1 - distFromCenter * 0.5;
        
        return {
          offsetX: (Math.random() - 0.5) * 40 * intensity * depthFactor,
          offsetY: Math.sin(t * 3 + lineY * 0.1) * 3 * depthFactor * intensity,
          alpha: (0.6 + 0.3 * depthFactor + 0.1 * Math.sin(t * 5 + i * 0.1)) * intensity
        };
      };
      rgbSplitIntensity = 8 * intensity;
  }
  
  // Рисуем линии с искажениями
  for (let i = 0; i < height; i += lineStep) {
    const lineY = y + i;
    const lineHeight = lineStep;
    
    // Получаем параметры искажения для текущей линии
    const distortion = distortionFunction(i, lineY);
    
    // Пропускаем некоторые строки для оптимизации на мобильных
    if (isMobile && i % 10 !== 0 && face !== 'front') continue;
    
    // Иногда делаем RGB split для эффекта голограммы
    if (i % (isMobile ? 24 : 12) === 0) {
      // Красный канал
      ctx.globalAlpha = distortion.alpha * 0.7;
      ctx.drawImage(
        video,
        x, lineY, width, lineHeight,
        (x + distortion.offsetX + rgbSplitIntensity) * scaleX, 
        (lineY + distortion.offsetY) * scaleY, 
        width * scaleX, lineHeight * scaleY
      );
      // Зелёный канал
      ctx.globalAlpha = distortion.alpha * 0.7;
      ctx.drawImage(
        video,
        x, lineY, width, lineHeight,
        (x + distortion.offsetX - rgbSplitIntensity) * scaleX, 
        (lineY + distortion.offsetY) * scaleY, 
        width * scaleX, lineHeight * scaleY
      );
      // Синий канал
      ctx.globalAlpha = distortion.alpha * 0.7;
      ctx.drawImage(
        video,
        x, lineY, width, lineHeight,
        (x + distortion.offsetX) * scaleX, 
        (lineY + distortion.offsetY) * scaleY, 
        width * scaleX, lineHeight * scaleY
      );
    } else {
      // Обычная смазанная полоса
      ctx.globalAlpha = distortion.alpha * 0.8;
      ctx.drawImage(
        video,
        x, lineY, width, lineHeight,
        (x + distortion.offsetX) * scaleX, 
        (lineY + distortion.offsetY) * scaleY, 
        width * scaleX, lineHeight * scaleY
      );
    }
  }
}

// Функция для рисования голографических частиц
function drawHolographicParticles(ctx, x, y, w, h, depth, time, scaleX, scaleY, isMobile = false) {
  const t = time;
  
  // Адаптивное количество частиц в зависимости от устройства
  const particleFactor = isMobile ? 0.5 : 1;
  
  // Основные частицы на передней грани
  const frontParticleCount = Math.floor(20 * particleFactor);
  for (let i = 0; i < frontParticleCount; i++) {
    const particleX = x + Math.random() * w;
    const particleY = y + Math.random() * h;
    const particleSize = 1 + Math.random() * 2 * particleFactor;
    const particleAlpha = 0.2 + 0.8 * Math.random() * particleFactor;
    
    ctx.fillStyle = `rgba(120, 220, 255, ${particleAlpha})`;
    ctx.beginPath();
    ctx.arc(particleX * scaleX, particleY * scaleY, particleSize, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Частицы на боковых гранях
  const sideParticleCount = Math.floor(10 * particleFactor);
  const leftX = x - depth * 0.7;
  const rightX = x + w;
  
  for (let i = 0; i < sideParticleCount; i++) {
    // Левая грань
    const leftParticleX = leftX + Math.random() * depth * 0.7;
    const leftParticleY = y + Math.random() * h;
    const leftParticleSize = 0.5 + Math.random() * 1.5 * particleFactor;
    const leftParticleAlpha = 0.1 + 0.4 * Math.random() * particleFactor;
    
    ctx.fillStyle = `rgba(100, 200, 255, ${leftParticleAlpha})`;
    ctx.beginPath();
    ctx.arc(leftParticleX * scaleX, leftParticleY * scaleY, leftParticleSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Правая грань
    const rightParticleX = rightX + Math.random() * depth * 0.7;
    const rightParticleY = y + Math.random() * h;
    const rightParticleSize = 0.5 + Math.random() * 1.5 * particleFactor;
    const rightParticleAlpha = 0.1 + 0.4 * Math.random() * particleFactor;
    
    ctx.fillStyle = `rgba(100, 200, 255, ${rightParticleAlpha})`;
    ctx.beginPath();
    ctx.arc(rightParticleX * scaleX, rightParticleY * scaleY, rightParticleSize, 0, Math.PI * 2);
    ctx.fill();
  }
  
  // Частицы для верхней и нижней граней
  const topY = y - depth * 0.4;
  const bottomY = y + h;
  
  for (let i = 0; i < sideParticleCount; i++) {
    // Верхняя грань
    const topParticleX = x + Math.random() * w;
    const topParticleY = topY + Math.random() * depth * 0.4;
    const topParticleSize = 0.5 + Math.random() * 1.5 * particleFactor;
    const topParticleAlpha = 0.1 + 0.4 * Math.random() * particleFactor;
    
    ctx.fillStyle = `rgba(100, 200, 255, ${topParticleAlpha})`;
    ctx.beginPath();
    ctx.arc(topParticleX * scaleX, topParticleY * scaleY, topParticleSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Нижняя грань
    const bottomParticleX = x + Math.random() * w;
    const bottomParticleY = bottomY + Math.random() * depth * 0.4;
    const bottomParticleSize = 0.5 + Math.random() * 1.5 * particleFactor;
    const bottomParticleAlpha = 0.1 + 0.4 * Math.random() * particleFactor;
    
    ctx.fillStyle = `rgba(100, 200, 255, ${bottomParticleAlpha})`;
    ctx.beginPath();
    ctx.arc(bottomParticleX * scaleX, bottomParticleY * scaleY, bottomParticleSize, 0, Math.PI * 2);
    ctx.fill();
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
  z-index: 5; /* Увеличиваем z-index сцены */
}

/* Стили для 3D моделей, чтобы они рендерились поверх эффекта */
:deep(.a-entity[gltf-model]) {
  z-index: 15 !important;
  pointer-events: auto !important;
  /* Убираем потенциально проблемные CSS свойства, которые могут влиять на WebGL рендеринг */
  transform-style: preserve-3d;
  backface-visibility: visible;
}

/* Голографический экран */
.hologram-frame {
  position: absolute;
  border: 1px solid rgba(0, 195, 255, 0.7);
  box-shadow: 0 0 8px rgba(0, 195, 255, 0.8), inset 0 0 15px rgba(0, 195, 255, 0.5);
  background: radial-gradient(
    circle at center,
    rgba(0, 195, 255, 0.03) 0%,
    rgba(0, 165, 255, 0.01) 70%,
    rgba(0, 125, 255, 0) 100%
  );
  z-index: 4;
  pointer-events: none;
  transform-style: preserve-3d;
  transform: perspective(800px) rotateX(2deg) rotateY(-2deg);
  backdrop-filter: blur(1px);
  transition: all 0.5s ease;
  opacity: 0.7;
  overflow: visible; /* Изменяем на visible, чтобы видеть все грани */
}

/* Адаптивные стили для мобильных устройств */
@media (max-width: 767px) {
  .hologram-frame {
    border-width: 1px;
    box-shadow: 0 0 5px rgba(0, 195, 255, 0.7), inset 0 0 10px rgba(0, 195, 255, 0.4);
  }
  
  .corner-line {
    width: 30px;
    height: 30px;
  }
  
  .corner-line.top-left {
    top: -15px;
    left: -15px;
  }
  
  .corner-line.top-right {
    top: -15px;
    right: -15px;
  }
  
  .corner-line.bottom-left {
    bottom: -15px;
    left: -15px;
  }
  
  .corner-line.bottom-right {
    bottom: -15px;
    right: -15px;
  }
  
  .connector-line {
    width: 1px;
    height: 30px;
  }
  
  .side-face {
    border-width: 1px;
  }
  
  .left-face, .right-face {
    width: 30px;
  }
  
  .top-face, .bottom-face {
    height: 30px;
  }
}

.hologram-frame::before,
.hologram-frame::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 1px solid rgba(0, 225, 255, 0.3);
  animation: pulse 3s infinite alternate ease-in-out;
  pointer-events: none;
}

.hologram-frame::after {
  animation-delay: 1.5s;
}

/* Линия сканирования */
.scan-line {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(
    to right,
    rgba(0, 195, 255, 0),
    rgba(0, 195, 255, 0.5),
    rgba(0, 195, 255, 0.8),
    rgba(0, 195, 255, 0.5),
    rgba(0, 195, 255, 0)
  );
  box-shadow: 0 0 8px rgba(0, 195, 255, 0.8);
  animation: scanLine 3s linear infinite;
  opacity: 0.7;
}

@media (max-width: 767px) {
  .scan-line {
    height: 1px;
    box-shadow: 0 0 4px rgba(0, 195, 255, 0.6);
  }
}

/* Сетка голограммы */
.holo-grid {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: 
    linear-gradient(rgba(0, 195, 255, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 195, 255, 0.05) 1px, transparent 1px);
  background-size: 20px 20px;
  opacity: 0.5;
  animation: gridPulse 4s infinite alternate ease-in-out;
}

@media (max-width: 767px) {
  .holo-grid {
    background-size: 15px 15px;
  }
}

/* Соединительные линии для параллелепипеда */
.corner-line {
  position: absolute;
  width: 40px;
  height: 40px;
  border-color: rgba(0, 215, 255, 0.8);
  border-style: solid;
  border-width: 0;
  box-shadow: 0 0 8px rgba(0, 195, 255, 0.6);
  pointer-events: none;
  animation: cornerPulse 3s infinite;
}

.corner-line.top-left {
  top: -20px;
  left: -20px;
  border-top-width: 2px;
  border-left-width: 2px;
  transform: perspective(800px) translate3d(-20px, -20px, 30px);
  animation-delay: 0s;
}

.corner-line.top-right {
  top: -20px;
  right: -20px;
  border-top-width: 2px;
  border-right-width: 2px;
  transform: perspective(800px) translate3d(20px, -20px, 30px);
  animation-delay: 0.75s;
}

.corner-line.bottom-left {
  bottom: -20px;
  left: -20px;
  border-bottom-width: 2px;
  border-left-width: 2px;
  transform: perspective(800px) translate3d(-20px, 20px, 30px);
  animation-delay: 1.5s;
}

.corner-line.bottom-right {
  bottom: -20px;
  right: -20px;
  border-bottom-width: 2px;
  border-right-width: 2px;
  transform: perspective(800px) translate3d(20px, 20px, 30px);
  animation-delay: 2.25s;
}

/* Соединительные линии между передней и задней гранями */
.connector-line {
  position: absolute;
  background-color: rgba(0, 215, 255, 0.6);
  box-shadow: 0 0 8px rgba(0, 195, 255, 0.6);
  width: 2px;
  height: 40px;
  transform-style: preserve-3d;
  animation: connectorPulse 3s infinite alternate;
}

.connector-line.top-left-connector {
  top: -20px;
  left: -20px;
  transform: perspective(800px) rotateX(15deg) rotateY(-15deg);
}

.connector-line.top-right-connector {
  top: -20px;
  right: -20px;
  transform: perspective(800px) rotateX(15deg) rotateY(15deg);
}

.connector-line.bottom-left-connector {
  bottom: -20px;
  left: -20px;
  transform: perspective(800px) rotateX(-15deg) rotateY(-15deg);
}

.connector-line.bottom-right-connector {
  bottom: -20px;
  right: -20px;
  transform: perspective(800px) rotateX(-15deg) rotateY(15deg);
}

/* Передняя грань параллелепипеда - поверх рамки */
.front-face {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  border: 1px solid rgba(0, 215, 255, 0.7);
  box-shadow: 0 0 8px rgba(0, 195, 255, 0.8), inset 0 0 15px rgba(0, 195, 255, 0.5);
  background: rgba(0, 155, 255, 0.05);
  z-index: 2;
  transform: translateZ(1px);
  animation: frontFacePulse 4s infinite alternate ease-in-out;
}

@keyframes frontFacePulse {
  0% {
    box-shadow: 0 0 8px rgba(0, 195, 255, 0.6), inset 0 0 15px rgba(0, 195, 255, 0.3);
    background: rgba(0, 155, 255, 0.03);
  }
  100% {
    box-shadow: 0 0 12px rgba(0, 215, 255, 0.8), inset 0 0 20px rgba(0, 215, 255, 0.5);
    background: rgba(0, 155, 255, 0.07);
  }
}

/* Боковые грани параллелепипеда */
.side-face {
  position: absolute;
  background: rgba(0, 150, 255, 0.1);
  border: 1px solid rgba(0, 195, 255, 0.5);
  box-shadow: 0 0 5px rgba(0, 195, 255, 0.4);
  transform-style: preserve-3d;
  pointer-events: none;
  opacity: 0.6;
  z-index: 1;
}

.left-face {
  top: 0;
  left: 0;
  width: 40px;
  height: 100%;
  transform-origin: left center;
  transform: translateX(-40px) rotateY(90deg);
}

.right-face {
  top: 0;
  right: 0;
  width: 40px;
  height: 100%;
  transform-origin: right center;
  transform: translateX(40px) rotateY(-90deg);
}

.top-face {
  top: 0;
  left: 0;
  width: 100%;
  height: 40px;
  transform-origin: top center;
  transform: translateY(-40px) rotateX(-90deg);
}

.bottom-face {
  bottom: 0;
  left: 0;
  width: 100%;
  height: 40px;
  transform-origin: bottom center;
  transform: translateY(40px) rotateX(90deg);
}

/* Задняя грань параллелепипеда */
.back-face {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  border: 1px solid rgba(0, 155, 255, 0.4);
  box-shadow: 0 0 5px rgba(0, 155, 255, 0.3);
  transform: perspective(800px) translateZ(-40px);
  opacity: 0.4;
  background: rgba(0, 100, 255, 0.05);
  pointer-events: none;
}

/* Анимация для соединительных линий */
@keyframes connectorPulse {
  0% {
    opacity: 0.3;
    height: 30px;
  }
  100% {
    opacity: 0.6;
    height: 40px;
  }
}

/* Анимация пульсации для углов */
@keyframes cornerPulse {
  0%, 100% {
    opacity: 0.4;
    box-shadow: 0 0 5px rgba(0, 195, 255, 0.4);
  }
  50% {
    opacity: 0.8;
    box-shadow: 0 0 12px rgba(0, 215, 255, 0.8);
  }
}

@keyframes scanLine {
  0% {
    top: 0%;
  }
  100% {
    top: 100%;
  }
}

@keyframes gridPulse {
  0% {
    opacity: 0.3;
    background-size: 20px 20px;
  }
  100% {
    opacity: 0.5;
    background-size: 22px 22px;
  }
}

@keyframes pulse {
  0% {
    opacity: 0.3;
    transform: scale(0.98);
  }
  100% {
    opacity: 0.8;
    transform: scale(1.01);
  }
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
  z-index: 3; /* Уменьшаем z-index canvas, чтобы он был ниже сцены */
}

@media (max-width: 767px) {
  /* Убираем отладочную информацию на мобильных устройствах */
  .debug-info {
    font-size: 10px;
    max-width: 50%;
    opacity: 0.7;
  }
}
</style> 