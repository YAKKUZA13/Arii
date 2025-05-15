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
    <div class="debug-info" v-if="debugInfo">
      <p>Статус камеры: {{ debugInfo.cameraStatus }}</p>
      <p>Разрешение: {{ debugInfo.resolution }}</p>
      <p>Ошибки: {{ debugInfo.errors }}</p>
      <p>AR.js статус: {{ debugInfo.arStatus }}</p>
      <p>Последнее обновление: {{ debugInfo.lastUpdate }}</p>
      <p>Глитч статус: {{ debugInfo.glitchStatus }}</p>
      <p>Статус модели: {{ debugInfo.modelStatus }}</p>
      <p>Статус сегментации: {{ debugInfo.segmentationStatus }}</p>
      <div v-if="detectedBoxes && detectedBoxes.length" class="detected-objects">
        <p>Распознанные объекты:</p>
        <ul>
          <li v-for="(box, idx) in detectedBoxes" :key="idx">
            {{ box.class }} ({{ (box.score * 100).toFixed(1) }}%)<br>
            <small>размер: {{ box.bbox[2] }}x{{ box.bbox[3] }} px</small>
          </li>
        </ul>
      </div>
      <div v-else class="detected-objects">
        <p>Объекты не распознаны</p>
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
const detectedBoxes = ref([]) // массив прямоугольников [x, y, w, h]
const overlayCanvas = ref(null)
let lastRect = null
let glitchTime = 0;
let glitchAnimFrame = null;

// --- TensorFlow.js DeepLab интеграция ---
let deepLabModel = null
let segmentationMask = null
let expandedMask = null
let segmentationCanvas = null
let segmentationCtx = null

// --- Общий canvas и texture для glitch-effect ---
let sharedCameraCanvas = null
let sharedCameraCtx = null
let sharedCameraTexture = null
let sharedVideo = null

// Переменные для отслеживания движения
let prevMaskCenter = { x: 0, y: 0 };
let objectVelocity = { x: 0, y: 0 };
let velocityHistory = []; // история скоростей для сглаживания

// Кэшируем параметры полос для каждого bbox на несколько кадров вперёд
let glitchCache = {};

const debugInfo = ref({
  cameraStatus: 'Инициализация...',
  resolution: 'Не определено',
  errors: '',
  arStatus: 'Инициализация...',
  lastUpdate: new Date().toLocaleTimeString(),
  glitchStatus: 'Инициализация...',
  modelStatus: 'Модель не загружена',
  segmentationStatus: 'DeepLab: не загружена'
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

    // Инициализируем canvas для сегментации
    segmentationCanvas = document.createElement('canvas');
    segmentationCtx = segmentationCanvas.getContext('2d', { willReadFrequently: true });

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

    // Загружаем модель DeepLab вместо coco-ssd
    await loadDeepLabModel();
    
    // Тестируем модель DeepLab после загрузки
    // Даем время на инициализацию видео
    setTimeout(async () => {
      try {
        const testResult = await testDeepLabModel();
        console.log('Результат тестирования DeepLab:', testResult ? 'успешно' : 'с ошибками');
      } catch (testError) {
        console.error('Ошибка при тестировании DeepLab:', testError);
      }
    }, 2000);
    
    // Запускаем процесс сегментации
    detectAndSegment();
    
    // Запускаем анимацию эффекта
    glitchOverlayLoop();
    
    window.addEventListener('resize', handleResize);

  } catch (error) {
    isSupported.value = false;
    updateDebugInfo({
      cameraStatus: 'Ошибка',
      errors: `Ошибка: ${error.message}`
    });
    console.error('Ошибка при инициализации:', error);
  }
});

function glitchOverlayLoop() {
  glitchTime = performance.now();
  drawOverlay();
  glitchAnimFrame = requestAnimationFrame(glitchOverlayLoop);
}

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

// Синхронизация detectedBoxes для glitch-effect
window.__vueDetectedBoxes = [];
watchEffect(() => {
  window.__vueDetectedBoxes = detectedBoxes.value;
});

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
  // Проверяем, есть ли canvas для отображения
  const canvas = overlayCanvas.value;
  if (!canvas) {
    console.log('Canvas для эффектов не найден');
    return;
  }
  
  // Синхронизируем размеры canvas с видео
  syncOverlayCanvas();
  
  if (!lastRect) {
    console.log('Не удалось определить размеры canvas');
    return;
  }
  
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Проверяем, есть ли видео
  const video = document.querySelector('video');
  if (!video || video.readyState !== 4) {
    console.log('Видео не готово для отрисовки эффектов');
    return;
  }
  
  // Получаем текущее время для анимации
  const t = glitchTime / 1000;
  
  // Если нет маски сегментации, используем старый метод с прямоугольниками
  if (!segmentationMask) {
    console.log('Нет маски сегментации, используем bounding boxes для эффекта');
    
    const scaleX = canvas.width / 1280;
    const scaleY = canvas.height / 720;
    
    if (detectedBoxes.value.length === 0) {
      console.log('Нет обнаруженных объектов для наложения эффекта');
      return;
    }
    
    detectedBoxes.value.forEach((box, boxIdx) => {
      console.log('Накладываем эффект на объект:', box);
      const [x, y, w, h] = box.bbox;
      
      // Применяем глитч-эффект только по краям (внешний контур)
      drawBoxOutline(ctx, x, y, w, h, scaleX, scaleY, t, video);
    });
    
    return;
  }
  
  // Если есть маска сегментации, используем её для более точного эффекта
  console.log('Используем маску сегментации для эффекта');
  
  // Проверяем соответствие размеров
  if (canvas.width === 0 || canvas.height === 0 || segmentationMask.width === 0 || segmentationMask.height === 0) {
    console.error('Ошибка размеров canvas или маски:', 
      canvas.width, canvas.height, segmentationMask.width, segmentationMask.height);
    return;
  }
  
  const scaleX = canvas.width / segmentationMask.width;
  const scaleY = canvas.height / segmentationMask.height;
  
  // Создаем временный canvas для маски
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = segmentationMask.width;
  maskCanvas.height = segmentationMask.height;
  const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
  
  // Отрисовываем маску сегментации
  maskCtx.putImageData(segmentationMask, 0, 0);
  
  // Создаем новый временный canvas для работы с контуром
  const edgeCanvas = document.createElement('canvas');
  edgeCanvas.width = segmentationMask.width;
  edgeCanvas.height = segmentationMask.height;
  const edgeCtx = edgeCanvas.getContext('2d', { willReadFrequently: true });
  
  // Рисуем маску на этот временный canvas
  edgeCtx.drawImage(maskCanvas, 0, 0);
  
  // Находим край маски, уменьшив ее размер и вычтя из оригинала
  edgeCtx.save();
  edgeCtx.globalCompositeOperation = 'destination-out';
  
  // Уменьшаем маску для получения внутреннего края - сделаем ещё тоньше
  const edgeThickness = 0.92; // Уменьшаем до 0.92 для получения более выраженного контура (было 0.97)
  const offsetX = (maskCanvas.width * (1 - edgeThickness)) / 2;
  const offsetY = (maskCanvas.height * (1 - edgeThickness)) / 2;
  
  edgeCtx.drawImage(
    maskCanvas, 
    0, 0, maskCanvas.width, maskCanvas.height,
    offsetX, offsetY, maskCanvas.width * edgeThickness, maskCanvas.height * edgeThickness
  );
  edgeCtx.restore();
  
  // Теперь у нас есть только тонкий контур
  
  // Рисуем видео на временный canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = segmentationMask.width;
  tempCanvas.height = segmentationMask.height;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
  
  // Накладываем эффект глитча только на контур
  ctx.save();
  
  // Рассчитываем интенсивность эффекта на основе обнаруженного движения
  // Чем больше движения, тем сильнее эффект
  const movementIntensity = Math.sqrt(lastMovementX * lastMovementX + lastMovementY * lastMovementY);
  const movementMultiplier = 1 + movementIntensity * 5; // Усиливаем эффект при движении
  
  // Пространственное смещение и RGB-сдвиг анимируем плавно
  const edgeGlitchIntensity = 8 * movementMultiplier; // Усиливаем при движении
  const maxRgbShift = 6 * movementMultiplier; // Увеличиваем RGB сдвиг при движении
  
  // Создаем светящийся контур с изменяющимся цветом на основе движения
  // Меняем цвет в зависимости от направления движения
  const hue = (Math.atan2(lastMovementY, lastMovementX) + Math.PI) / (2 * Math.PI) * 360;
  ctx.shadowColor = `hsla(${hue}, 90%, 60%, 0.8)`;
  ctx.shadowBlur = 12 * movementMultiplier; // Увеличиваем свечение при движении
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(edgeCanvas, 0, 0, canvas.width, canvas.height);
  
  // Добавляем RGB сдвиг для контура с более интенсивными цветами
  // Красный канал
  ctx.globalAlpha = 0.6;
  ctx.drawImage(
    edgeCanvas,
    0, 0, edgeCanvas.width, edgeCanvas.height,
    -maxRgbShift * Math.sin(t * 2), 0, canvas.width, canvas.height
  );
  
  // Синий канал
  ctx.globalAlpha = 0.7;
  ctx.drawImage(
    edgeCanvas,
    0, 0, edgeCanvas.width, edgeCanvas.height,
    maxRgbShift * Math.sin(t * 2), 0, canvas.width, canvas.height
  );
  
  // Периодически добавляем горизонтальные полосы глитча на контуре
  // Увеличиваем вероятность глитча при движении
  if (Math.random() < 0.25 + movementIntensity * 0.5) { // Максимум 0.75 при сильном движении
    const glitchLines = 5 + Math.floor(Math.random() * 8 * movementMultiplier); // Больше линий при движении
    const lineHeight = maskCanvas.height / glitchLines;
    
    for (let i = 0; i < glitchLines; i++) {
      if (Math.random() < 0.4 + movementIntensity * 0.3) { // Больше шансов на глитч при движении
        const y = Math.floor(Math.random() * maskCanvas.height);
        const height = Math.ceil(lineHeight / 2);
        const offsetX = (Math.random() - 0.5) * edgeGlitchIntensity;
        
        // Получаем часть контура
        const stripImageData = edgeCtx.getImageData(0, y, edgeCanvas.width, height);
        
        // Проверяем, есть ли в этой полосе пиксели контура
        let hasEdgePixels = false;
        for (let p = 0; p < stripImageData.data.length; p += 4) {
          if (stripImageData.data[p] > 0) {
            hasEdgePixels = true;
            break;
          }
        }
        
        // Если есть пиксели контура, применяем глитч
        if (hasEdgePixels) {
          ctx.globalAlpha = 0.6 + movementIntensity * 0.2; // Увеличиваем непрозрачность при движении
          ctx.globalCompositeOperation = 'screen';
          
          // Создаем временный canvas для полосы
          const stripCanvas = document.createElement('canvas');
          stripCanvas.width = edgeCanvas.width;
          stripCanvas.height = height;
          const stripCtx = stripCanvas.getContext('2d', { willReadFrequently: true });
          stripCtx.putImageData(stripImageData, 0, 0);
          
          // Рисуем полосу со смещением, усиленным при движении
          ctx.drawImage(
            stripCanvas,
            0, 0, stripCanvas.width, stripCanvas.height,
            offsetX * scaleX * (1 + movementIntensity), y * scaleY, canvas.width, height * scaleY
          );
        }
      }
    }
  }
  
  // Добавляем пульсирующее свечение по контуру с изменением цвета при движении
  const glowColors = [
    `hsla(${(hue + 0) % 360}, 100%, 70%, 0.6)`,     // Основной цвет
    `hsla(${(hue + 120) % 360}, 100%, 60%, 0.5)`,   // Дополнительный цвет 1
    `hsla(${(hue + 240) % 360}, 100%, 50%, 0.5)`    // Дополнительный цвет 2
  ];
  
  // Более активная пульсация при движении
  const pulseFrequency = 3 + movementIntensity * 2; // Быстрее пульсирует при движении
  const pulseIntensity = 0.2 + 0.2 * Math.sin(t * pulseFrequency) + movementIntensity * 0.2;
  const currentGlowColor = glowColors[Math.floor(t * 0.5) % glowColors.length];
  
  ctx.globalAlpha = pulseIntensity;
  ctx.globalCompositeOperation = 'screen';
  ctx.shadowColor = currentGlowColor;
  ctx.shadowBlur = 12 + movementIntensity * 5; // Увеличиваем размер свечения при движении
  ctx.drawImage(edgeCanvas, 0, 0, canvas.width, canvas.height);
  
  ctx.restore();
}

// Вспомогательная функция для рисования контура вокруг прямоугольника
function drawBoxOutline(ctx, x, y, w, h, scaleX, scaleY, time, video) {
  // Толщина контура
  const outlineWidth = 10;
  
  // RGB-сдвиг для цветных краев
  const rgbShift = Math.sin(time * 3) * 5;
  
  // 1. Рисуем верхнюю границу
  drawGlitchStrip(ctx, x, y, w, outlineWidth, scaleX, scaleY, rgbShift, time, video);
  
  // 2. Рисуем нижнюю границу
  drawGlitchStrip(ctx, x, y + h - outlineWidth, w, outlineWidth, scaleX, scaleY, rgbShift, time, video);
  
  // 3. Рисуем левую границу
  drawGlitchStrip(ctx, x, y + outlineWidth, outlineWidth, h - 2 * outlineWidth, scaleX, scaleY, rgbShift, time, video);
  
  // 4. Рисуем правую границу
  drawGlitchStrip(ctx, x + w - outlineWidth, y + outlineWidth, outlineWidth, h - 2 * outlineWidth, scaleX, scaleY, rgbShift, time, video);
  
  // Добавляем свечение по контуру
  ctx.save();
  ctx.strokeStyle = `rgba(120, 220, 255, ${0.3 + 0.2 * Math.sin(time * 3)})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(20, 220, 255, 0.8)';
  ctx.shadowBlur = 15;
  ctx.strokeRect(x * scaleX, y * scaleY, w * scaleX, h * scaleY);
  ctx.restore();
}

// Функция для рисования полосы с глитч-эффектом
function drawGlitchStrip(ctx, x, y, w, h, scaleX, scaleY, rgbShift, time, video) {
  // Случайное смещение для глитч-эффекта
  const glitchOffset = (Math.random() - 0.5) * 8;
  
  // Рисуем с RGB-сдвигом для имитации хроматической аберрации
  // Красный канал
  ctx.globalAlpha = 0.6;
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(
    video,
    x, y, w, h,
    (x + glitchOffset + rgbShift) * scaleX, y * scaleY, w * scaleX, h * scaleY
  );
  
  // Зеленый канал
  ctx.globalAlpha = 0.6;
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(
    video,
    x, y, w, h,
    (x + glitchOffset) * scaleX, y * scaleY, w * scaleX, h * scaleY
  );
  
  // Синий канал
  ctx.globalAlpha = 0.6;
  ctx.globalCompositeOperation = 'screen';
  ctx.drawImage(
    video,
    x, y, w, h,
    (x + glitchOffset - rgbShift) * scaleX, y * scaleY, w * scaleX, h * scaleY
  );
  
  // Возвращаем настройки
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
}

const isWebXRSupported = ref(true);

function onModelClick(evt) {
  alert('3D-объект нажат!');
}

// Функция для обнаружения объектов и создания маски
async function detectAndSegment() {
  try {
    const video = document.querySelector('video');
    if (video && video.readyState === 4) {
      // Получаем размеры видео
      const videoWidth = video.videoWidth || 1280;
      const videoHeight = video.videoHeight || 720;
      
      // Настраиваем canvas для маски
      if (segmentationCanvas.width !== videoWidth || segmentationCanvas.height !== videoHeight) {
        segmentationCanvas.width = videoWidth;
        segmentationCanvas.height = videoHeight;
      }
      
      // Анализируем пиксели видео для обнаружения движения
      detectMovement(video, videoWidth, videoHeight);
      
      // Используем DeepLab модель для сегментации, если она доступна
      if (deepLabModel) {
        try {
          // Вызываем модель DeepLab для сегментации
          console.log('Вызываем DeepLab.segment() для текущего кадра видео');
          const segmentationResult = await deepLabModel.segment(video);
          console.log('Результат сегментации DeepLab:', segmentationResult);
          
          // Проверяем, что у нас есть сегментация
          if (segmentationResult && segmentationResult.segmentationMap) {
            // Получаем карту сегментации (массив индексов классов для каждого пикселя)
            const segmentationMap = segmentationResult.segmentationMap;
            
            // Логируем уникальные классы, найденные в сегментации
            const uniqueClasses = new Set(segmentationMap);
            console.log('Найденные классы в сегментации:', Array.from(uniqueClasses));
            
            // Преобразуем карту сегментации в маску
            // Ищем класс person (индекс 15 в Pascal VOC)
            const personMaskData = segmentationCtx.createImageData(videoWidth, videoHeight);
            let personPixelsDetected = 0;
            
            for (let y = 0; y < videoHeight; y++) {
              for (let x = 0; x < videoWidth; x++) {
                // Индекс в карте сегментации
                const mapIdx = y * videoWidth + x;
                // Индекс в данных маски (RGBA - 4 байта на пиксель)
                const pixelIdx = mapIdx * 4;
                
                // Проверяем, является ли пиксель частью класса "человек" (индекс 15)
                if (segmentationMap[mapIdx] === 15) {
                  personMaskData.data[pixelIdx] = 255;     // R
                  personMaskData.data[pixelIdx + 1] = 255; // G
                  personMaskData.data[pixelIdx + 2] = 255; // B
                  personMaskData.data[pixelIdx + 3] = 255; // A
                  personPixelsDetected++;
                }
              }
            }
            
            console.log(`Обнаружено ${personPixelsDetected} пикселей человека`);
            
            // Применяем маску на canvas только если обнаружены пиксели
            if (personPixelsDetected > 0) {
              segmentationCtx.putImageData(personMaskData, 0, 0);
              
              // Сохраняем маску
              segmentationMask = personMaskData;
              
              // Создаем расширенную маску для эффекта
              createExpandedMask();
              
              // Находим ограничивающий прямоугольник для человека
              const personBoxes = maskToBoundingBoxes(segmentationMap, videoWidth, videoHeight, [15]);
              
              if (personBoxes.length > 0) {
                // Используем найденные боксы для людей
                detectedBoxes.value = personBoxes;
              } else {
                // Если боксы не найдены, но пиксели человека есть, создаем бокс для всей маски
                detectedBoxes.value = [{
                  bbox: [0, 0, videoWidth, videoHeight],
                  class: 'человек',
                  classId: 15,
                  score: personPixelsDetected / (videoWidth * videoHeight)
                }];
              }
              
              // Обновляем глобальные маски
              updateGlobalMasks();
              
              // Обновляем информацию о сегментации
              updateDebugInfo({
                segmentationStatus: `DeepLab: обнаружен человек (${((personPixelsDetected / (videoWidth * videoHeight)) * 100).toFixed(1)}%)`
              });
              
              // Если обнаружены пиксели человека, не создаем тестовую маску
              // Запускаем функцию снова через requestAnimationFrame для постоянного обновления
              requestAnimationFrame(detectAndSegment);
              return;
            } else {
              console.log('Человек в кадре не обнаружен, используем тестовую маску');
              updateDebugInfo({
                segmentationStatus: 'DeepLab: человек не обнаружен'
              });
            }
          } else {
            console.log('Результат сегментации DeepLab отсутствует или некорректен');
            updateDebugInfo({
              segmentationStatus: 'DeepLab: ошибка сегментации'
            });
          }
        } catch (error) {
          console.error('Ошибка при вызове DeepLab.segment():', error);
          updateDebugInfo({
            segmentationStatus: 'DeepLab: ошибка сегментации',
            errors: error.message
          });
        }
      }
      
      // Если модель DeepLab не доступна или не обнаружено людей, используем тестовую маску
      const testMaskData = segmentationCtx.createImageData(videoWidth, videoHeight);
      
      // Смещаем центр силуэта в зависимости от обнаруженного движения
      // Используем lastMovementX и lastMovementY для смещения центра силуэта
      const centerX = videoWidth / 2 + lastMovementX * 100; // Увеличиваем чувствительность
      const centerY = videoHeight / 2 + lastMovementY * 100;
      
      // Параметры силуэта
      const bodyWidth = videoWidth * 0.25;
      const bodyHeight = videoHeight * 0.7;
      const headRadius = bodyWidth * 0.3;
      
      let pixelsDetected = 0;
      
      for (let y = 0; y < videoHeight; y++) {
        for (let x = 0; x < videoWidth; x++) {
          // Проверяем, попадает ли пиксель в силуэт "человека"
          const dx = x - centerX;
          const dy = y - centerY;
          
          // Голова (круг)
          const headDist = Math.sqrt(dx * dx + Math.pow(dy + bodyHeight/3, 2));
          const inHead = headDist < headRadius;
          
          // Тело (эллипс)
          const bodyX = dx / (bodyWidth/2);
          const bodyY = (dy + headRadius) / (bodyHeight/2);
          const inBody = (bodyX * bodyX + bodyY * bodyY) < 1;
          
          const pixelIndex = (y * videoWidth + x) * 4;
          
          if (inHead || inBody) {
            // Пиксель внутри силуэта
            testMaskData.data[pixelIndex] = 255;      // R
            testMaskData.data[pixelIndex + 1] = 255;  // G
            testMaskData.data[pixelIndex + 2] = 255;  // B
            testMaskData.data[pixelIndex + 3] = 255;  // A
            pixelsDetected++;
          }
        }
      }
      
      // Применяем искусственную маску
      segmentationCtx.putImageData(testMaskData, 0, 0);
      
      // Сохраняем маску
      segmentationMask = segmentationCtx.getImageData(0, 0, videoWidth, videoHeight);
      
      // Создаем расширенную маску для эффекта
      createExpandedMask();
      
      // Создаем бокс для всей маски
      const testBbox = [0, 0, videoWidth, videoHeight];
      
      // Установим обнаруженный объект для отображения эффекта
      detectedBoxes.value = [{
        bbox: testBbox,
        class: 'движущийся силуэт',
        score: pixelsDetected / (videoWidth * videoHeight)
      }];
      
      // Обновляем глобальные маски
      updateGlobalMasks();
      
      // Отображаем информацию о тестовом силуэте
      updateDebugInfo({
        segmentationStatus: `Движущийся силуэт: ${((pixelsDetected / (videoWidth * videoHeight)) * 100).toFixed(1)}%`
      });
    }
  } catch (error) {
    console.error('Ошибка в detectAndSegment:', error);
    updateDebugInfo({ errors: error.message });
  }
  
  // Запускаем функцию снова через requestAnimationFrame для постоянного обновления
  requestAnimationFrame(detectAndSegment);
}

// Переменные для отслеживания движения в видео
let prevFrameData = null;
let lastMovementX = 0;
let lastMovementY = 0;
let movingPixelsHistory = [];

// Функция для обнаружения движения в видео
function detectMovement(video, width, height) {
  // Создаем временный canvas для анализа видео
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  
  // Рисуем текущий кадр видео
  tempCtx.drawImage(video, 0, 0, width, height);
  
  // Получаем данные о пикселях текущего кадра
  const currentFrameData = tempCtx.getImageData(0, 0, width, height);
  
  // Если у нас есть предыдущий кадр, сравниваем с ним
  if (prevFrameData) {
    let movingPixelsCount = 0;
    let moveVectorX = 0;
    let moveVectorY = 0;
    
    // Создаем тепловую карту движения для более точного анализа
    const heatmapWidth = 32;  // Размер тепловой карты по X
    const heatmapHeight = 24; // Размер тепловой карты по Y
    const cellWidth = Math.floor(width / heatmapWidth);
    const cellHeight = Math.floor(height / heatmapHeight);
    
    // Массив для хранения "тепла" движения по ячейкам
    const heatmap = new Array(heatmapWidth * heatmapHeight).fill(0);
    
    // Анализируем изображение по ячейкам
    for (let gy = 0; gy < heatmapHeight; gy++) {
      for (let gx = 0; gx < heatmapWidth; gx++) {
        const startX = gx * cellWidth;
        const startY = gy * cellHeight;
        
        // Рассчитываем среднее изменение в ячейке
        let cellDiff = 0;
        let pixelCount = 0;
        
        // Проверяем только 9 пикселей в ячейке для скорости
        for (let y = 0; y < 3; y++) {
          for (let x = 0; x < 3; x++) {
            const sampleX = startX + Math.floor(x * cellWidth / 3);
            const sampleY = startY + Math.floor(y * cellHeight / 3);
            
            if (sampleX < width && sampleY < height) {
              const idx = (sampleY * width + sampleX) * 4;
              
              // Разница между текущим и предыдущим кадром
              const rDiff = Math.abs(currentFrameData.data[idx] - prevFrameData.data[idx]);
              const gDiff = Math.abs(currentFrameData.data[idx + 1] - prevFrameData.data[idx + 1]);
              const bDiff = Math.abs(currentFrameData.data[idx + 2] - prevFrameData.data[idx + 2]);
              
              cellDiff += (rDiff + gDiff + bDiff) / 3;
              pixelCount++;
            }
          }
        }
        
        if (pixelCount > 0) {
          // Среднее изменение в ячейке
          const avgDiff = cellDiff / pixelCount;
          
          // Если изменение превышает порог, считаем ячейку движущейся
          if (avgDiff > 15) { // Порог для определения движения
            const heatmapIdx = gy * heatmapWidth + gx;
            heatmap[heatmapIdx] = avgDiff;
            
            // Координаты центра ячейки
            const centerX = startX + cellWidth / 2;
            const centerY = startY + cellHeight / 2;
            
            // Вес ячейки для расчета вектора движения (зависит от размера изменения)
            const weight = Math.min(1.0, avgDiff / 100);
            
            // Рассчитываем вектор движения
            const normalizedX = (centerX - width / 2) / width;
            const normalizedY = (centerY - height / 2) / height;
            
            moveVectorX += normalizedX * weight;
            moveVectorY += normalizedY * weight;
            movingPixelsCount++;
          }
        }
      }
    }
    
    // Если обнаружено движение, обновляем вектор движения
    if (movingPixelsCount > 0) {
      // Нормализуем вектор
      moveVectorX /= movingPixelsCount;
      moveVectorY /= movingPixelsCount;
      
      // Определяем общую интенсивность движения
      const movementMagnitude = Math.sqrt(moveVectorX * moveVectorX + moveVectorY * moveVectorY);
      
      // Добавляем текущее движение в историю
      movingPixelsHistory.push({
        x: moveVectorX,
        y: moveVectorY,
        intensity: movingPixelsCount / (heatmapWidth * heatmapHeight),
        magnitude: movementMagnitude,
        timestamp: Date.now()
      });
      
      // Ограничиваем длину истории
      while (movingPixelsHistory.length > 0 && 
             Date.now() - movingPixelsHistory[0].timestamp > 500) { // Храним только последние 500 мс
        movingPixelsHistory.shift();
      }
      
      // Рассчитываем среднее движение за последние 500 мс
      let avgX = 0;
      let avgY = 0;
      let totalWeight = 0;
      
      for (let i = 0; i < movingPixelsHistory.length; i++) {
        const entry = movingPixelsHistory[i];
        const age = (Date.now() - entry.timestamp) / 500; // 0-1, где 0 - самое новое
        const weight = Math.pow(1 - age, 2); // Квадратичное убывание веса со временем
        
        avgX += entry.x * entry.intensity * weight;
        avgY += entry.y * entry.intensity * weight;
        totalWeight += entry.intensity * weight;
      }
      
      if (totalWeight > 0) {
        // Сглаживаем движение с предыдущими значениями
        const smoothingFactor = 0.3; // Насколько быстро следовать за новыми значениями
        lastMovementX = lastMovementX * (1 - smoothingFactor) + (avgX / totalWeight) * smoothingFactor;
        lastMovementY = lastMovementY * (1 - smoothingFactor) + (avgY / totalWeight) * smoothingFactor;
      }
      
      // Отладка движения
      const movementMag = Math.sqrt(lastMovementX * lastMovementX + lastMovementY * lastMovementY);
      const movementAngle = Math.atan2(lastMovementY, lastMovementX) * 180 / Math.PI;
      
      // Обновляем отладочную информацию о движении
      updateDebugInfo({
        movementStatus: `Движение: ${(movementMag * 100).toFixed(1)}%, угол: ${movementAngle.toFixed(0)}°`
      });
      
      console.log(
        `Движение: ${movingPixelsCount} пикселей (${(movingPixelsCount / (heatmapWidth * heatmapHeight) * 100).toFixed(1)}%), ` +
        `вектор: [${lastMovementX.toFixed(2)}, ${lastMovementY.toFixed(2)}], ` +
        `сила: ${(movementMag * 100).toFixed(1)}%, угол: ${movementAngle.toFixed(0)}°`
      );
    } else {
      // Если нет движения, постепенно сбрасываем значения к нулю
      lastMovementX *= 0.95;
      lastMovementY *= 0.95;
      
      // Обновляем информацию
      if (Math.abs(lastMovementX) < 0.01 && Math.abs(lastMovementY) < 0.01) {
        updateDebugInfo({
          movementStatus: 'Движение не обнаружено'
        });
      } else {
        const movementMag = Math.sqrt(lastMovementX * lastMovementX + lastMovementY * lastMovementY);
        updateDebugInfo({
          movementStatus: `Движение затухает: ${(movementMag * 100).toFixed(1)}%`
        });
      }
    }
  }
  
  // Сохраняем текущий кадр как предыдущий для следующего сравнения
  prevFrameData = currentFrameData;
}

// Функция для создания расширенной маски (для эффекта объема)
function createExpandedMask() {
  if (!segmentationMask) return;
  
  // Создаем копию маски
  const width = segmentationMask.width;
  const height = segmentationMask.height;
  const expandedData = new Uint8ClampedArray(width * height * 4);
  
  // Создаем простой детектор краев
  // Для каждого пикселя проверяем его соседей
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const isFilledPixel = segmentationMask.data[idx] > 0;
      
      // Проверяем хотя бы один соседний пиксель с другим значением
      let isEdge = false;
      
      if (isFilledPixel) {
        // Проверяем только соседние пиксели (4-соседство)
        const neighbors = [
          { x: x-1, y: y },  // Левый
          { x: x+1, y: y },  // Правый
          { x: x, y: y-1 },  // Верхний
          { x: x, y: y+1 },  // Нижний
        ];
        
        for (const neighbor of neighbors) {
          if (neighbor.x >= 0 && neighbor.x < width && 
              neighbor.y >= 0 && neighbor.y < height) {
            const neighborIdx = (neighbor.y * width + neighbor.x) * 4;
            const neighborIsFilled = segmentationMask.data[neighborIdx] > 0;
            
            // Если сосед имеет другое значение (фон/объект), значит это граница
            if (neighborIsFilled !== isFilledPixel) {
              isEdge = true;
              break;
            }
          } else {
            // Если сосед за пределами маски, считаем это краем
            isEdge = true;
            break;
          }
        }
      }
      
      // Если это край объекта, добавляем его в расширенную маску
      if (isEdge) {
        expandedData[idx] = 255;      // R
        expandedData[idx + 1] = 255;  // G
        expandedData[idx + 2] = 255;  // B
        expandedData[idx + 3] = 255;  // A
      }
    }
  }
  
  // Сохраняем расширенную маску, содержащую только контур
  expandedMask = new ImageData(expandedData, width, height);
}

// Функция для преобразования маски сегментации в ограничивающие прямоугольники
function maskToBoundingBoxes(segmentationMap, width, height, targetClasses = [15]) {
  const boxes = [];
  // Отображение классов Pascal VOC
  const classNames = {
    0: 'background',
    1: 'aeroplane',
    2: 'bicycle',
    3: 'bird',
    4: 'boat',
    5: 'bottle',
    6: 'bus',
    7: 'car',
    8: 'cat',
    9: 'chair',
    10: 'cow',
    11: 'dining-table',
    12: 'dog',
    13: 'horse',
    14: 'motorbike',
    15: 'person',
    16: 'potted-plant',
    17: 'sheep',
    18: 'sofa',
    19: 'train',
    20: 'tv/monitor'
  };
  
  // Убедимся, что целевые классы определены
  if (!targetClasses || !Array.isArray(targetClasses) || targetClasses.length === 0) {
    targetClasses = [15]; // По умолчанию ищем класс "person" (15)
  }
  
  // Находим отдельные объекты по классам
  const classRegions = {};
  
  for (const classId of targetClasses) {
    // Инициализируем границы для этого класса
    classRegions[classId] = {
      minX: width,
      minY: height,
      maxX: 0,
      maxY: 0,
      pixelCount: 0,
      hasObject: false
    };
    
    // Ищем все пиксели этого класса
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (segmentationMap[idx] === classId) {
          const region = classRegions[classId];
          region.minX = Math.min(region.minX, x);
          region.minY = Math.min(region.minY, y);
          region.maxX = Math.max(region.maxX, x);
          region.maxY = Math.max(region.maxY, y);
          region.pixelCount++;
          region.hasObject = true;
        }
      }
    }
    
    // Если обнаружен объект этого класса, добавляем его бокс
    if (classRegions[classId].hasObject && classRegions[classId].pixelCount > 50) { // Минимальное количество пикселей
      const region = classRegions[classId];
      const className = classNames[classId] || `class-${classId}`;
      console.log(`Обнаружен объект класса ${className}, размер: ${region.pixelCount} пикселей`);
      
      boxes.push({
        bbox: [region.minX, region.minY, region.maxX - region.minX, region.maxY - region.minY],
        class: className,
        classId: classId,
        score: region.pixelCount / (width * height)
      });
    }
  }
  
  console.log('Найдено объектов:', boxes.length);
  return boxes;
}

// Делаем маску доступной глобально
function updateGlobalMasks() {
  if (segmentationMask) {
    window.segmentationMask = segmentationMask;
    window.expandedMask = expandedMask;
  }
}

// Обновляем информацию о сегментации для отладки
function updateSegmentationDebugInfo() {
  if (segmentationMask) {
    const objectPixels = countNonZeroPixels(segmentationMask);
    const totalPixels = segmentationMask.width * segmentationMask.height;
    const coverage = ((objectPixels / totalPixels) * 100).toFixed(1);
    
    updateDebugInfo({
      segmentationStatus: `DeepLab: активна (покрытие: ${coverage}%)`,
      detectionCount: detectedBoxes.value.length
    });
  }
}

// Вспомогательная функция для подсчета ненулевых пикселей
function countNonZeroPixels(imageData) {
  let count = 0;
  for (let i = 0; i < imageData.data.length; i += 4) {
    if (imageData.data[i] > 0) {
      count++;
    }
  }
  return count;
}

// Функция для расчета центра маски и скорости движения объекта
function calculateObjectMotion(mask) {
  if (!mask) return;
  
  // Находим центр маски (среднее по ненулевым пикселям)
  let sumX = 0, sumY = 0, count = 0;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const idx = (y * mask.width + x) * 4;
      if (mask.data[idx] > 0) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }
  
  // Если объектов нет, возвращаем предыдущее значение
  if (count === 0) return { center: prevMaskCenter, velocity: { x: 0, y: 0 } };
  
  // Рассчитываем центр
  const center = { x: sumX / count, y: sumY / count };
  
  // Рассчитываем скорость (разница с предыдущим кадром)
  const velocity = {
    x: center.x - prevMaskCenter.x,
    y: center.y - prevMaskCenter.y
  };
  
  // Добавляем в историю (для сглаживания)
  velocityHistory.push(velocity);
  if (velocityHistory.length > 5) velocityHistory.shift(); // храним только 5 последних значений
  
  // Сглаживаем скорость (среднее по истории)
  const smoothVelocity = {
    x: velocityHistory.reduce((sum, v) => sum + v.x, 0) / velocityHistory.length,
    y: velocityHistory.reduce((sum, v) => sum + v.y, 0) / velocityHistory.length
  };
  
  // Обновляем предыдущий центр
  prevMaskCenter = center;
  objectVelocity = smoothVelocity;
  
  return { center, velocity: smoothVelocity };
}

// Функция для применения адаптивного глитч-эффекта в зависимости от движения
function applyAdaptiveGlitch(ctx, mask, video, canvas, motion) {
  if (!mask || !video || !motion) return;
  
  const { center, velocity } = motion;
  
  // Масштабируем скорость для эффекта
  const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
  
  // Чем быстрее движение, тем сильнее глитч
  const glitchIntensity = Math.min(1.0, speed / 20); // Ограничиваем максимальную интенсивность
  
  // Направление глитча следует за движением
  const glitchAngle = Math.atan2(velocity.y, velocity.x);
  
  // Создаем временный canvas для обработки
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = mask.width;
  tempCanvas.height = mask.height;
  const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
  
  // Рисуем видео
  tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
  
  // Накладываем маску на основной canvas
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  
  // Применяем смещение в направлении движения (motion blur)
  const blurDistance = glitchIntensity * 15; // пиксели смещения
  const blurX = Math.cos(glitchAngle) * blurDistance;
  const blurY = Math.sin(glitchAngle) * blurDistance;
  
  // Рисуем несколько копий с уменьшающейся прозрачностью
  for (let i = 0; i < 5; i++) {
    const alpha = (5 - i) / 5; // От 1.0 до 0.2
    const distance = i / 5;
    
    ctx.globalAlpha = alpha * 0.2; // Уменьшаем для более мягкого эффекта
    ctx.drawImage(
      tempCanvas,
      0, 0, tempCanvas.width, tempCanvas.height,
      blurX * distance, blurY * distance, canvas.width, canvas.height
    );
  }
  
  // Возвращаем настройки
  ctx.globalAlpha = 1.0;
  ctx.restore();
  
  // Если движение быстрое, добавляем сильный глитч
  if (glitchIntensity > 0.4) {
    // Количество линий глитча зависит от скорости
    const glitchLines = Math.ceil(10 + glitchIntensity * 20);
    
    // Максимальное смещение глитча
    const maxOffset = glitchIntensity * 30;
    
    // Применяем глитч полосами в направлении движения
    for (let i = 0; i < glitchLines; i++) {
      // Перпендикулярное направление для линий
      const perpAngle = glitchAngle + Math.PI / 2;
      
      // Параметры полосы
      const stripWidth = mask.height / glitchLines;
      const stripOffset = (i - glitchLines / 2) * stripWidth;
      
      // Центр полосы
      const stripCenterX = center.x + Math.cos(perpAngle) * stripOffset;
      const stripCenterY = center.y + Math.sin(perpAngle) * stripOffset;
      
      // Случайный offset для полосы
      const randomOffset = (Math.random() - 0.5) * maxOffset;
      
      // Рисуем полосу
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.7;
      
      // Ограничиваем отрисовку полосы
      ctx.beginPath();
      ctx.rect(
        stripCenterX - tempCanvas.width / 2, 
        stripCenterY - stripWidth / 2,
        tempCanvas.width,
        stripWidth
      );
      ctx.clip();
      
      // Рисуем смещенное изображение в полосе
      ctx.drawImage(
        tempCanvas,
        0, 0, tempCanvas.width, tempCanvas.height,
        randomOffset, 0, canvas.width, canvas.height
      );
      
      ctx.restore();
    }
  }
}

// Функция для имитации взаимодействия с освещением в окружении
function applyLightInteraction(ctx, maskCanvas, canvas, time) {
  // Имитируем источник света, который движется по сцене
  const lightX = canvas.width * (0.5 + 0.3 * Math.sin(time * 0.5));
  const lightY = canvas.height * (0.5 + 0.2 * Math.cos(time * 0.7));
  
  // Создаем временный canvas для обработки освещения
  const lightCanvas = document.createElement('canvas');
  lightCanvas.width = canvas.width;
  lightCanvas.height = canvas.height;
  const lightCtx = lightCanvas.getContext('2d', { willReadFrequently: true });
  
  // Рисуем маску
  lightCtx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
  
  // Создаем градиент освещения
  const gradient = lightCtx.createRadialGradient(
    lightX, lightY, 0,
    lightX, lightY, canvas.width * 0.7
  );
  
  gradient.addColorStop(0, 'rgba(255, 255, 200, 0.5)');
  gradient.addColorStop(0.5, 'rgba(100, 100, 50, 0.2)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  
  // Применяем градиент к маске
  lightCtx.globalCompositeOperation = 'source-in';
  lightCtx.fillStyle = gradient;
  lightCtx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Рисуем результат на основной canvas
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(lightCanvas, 0, 0);
  ctx.restore();
  
  // Добавляем тень с противоположной стороны от источника света
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = canvas.width;
  shadowCanvas.height = canvas.height;
  const shadowCtx = shadowCanvas.getContext('2d', { willReadFrequently: true });
  
  // Рисуем маску
  shadowCtx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
  
  // Вектор от света к центру маски
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const toObjectX = centerX - lightX;
  const toObjectY = centerY - lightY;
  const dist = Math.sqrt(toObjectX * toObjectX + toObjectY * toObjectY);
  const normalizedX = toObjectX / dist;
  const normalizedY = toObjectY / dist;
  
  // Смещаем тень в направлении от света
  shadowCtx.globalCompositeOperation = 'source-over';
  shadowCtx.drawImage(
    maskCanvas,
    0, 0, canvas.width, canvas.height,
    normalizedX * 10, normalizedY * 10, canvas.width, canvas.height
  );
  
  // Добавляем эту тень на сцену
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.4;
  ctx.drawImage(shadowCanvas, 0, 0);
  ctx.restore();
}

// Функция для создания анимированного контура по маске
function drawAnimatedEdges(ctx, maskCanvas, width, height, time) {
  // Создаем временный canvas для работы с контуром
  const edgeCanvas = document.createElement('canvas');
  edgeCanvas.width = width;
  edgeCanvas.height = height;
  const edgeCtx = edgeCanvas.getContext('2d', { willReadFrequently: true });
  
  // Рисуем маску
  edgeCtx.drawImage(maskCanvas, 0, 0, width, height);
  
  // Нам нужно найти контур
  // Простой способ: рисуем маску с меньшим размером и вычитаем
  edgeCtx.save();
  edgeCtx.globalCompositeOperation = 'destination-out';
  
  // Уменьшаем маску для получения внутреннего края - сделаем тоньше
  const scale = 0.94; // Уменьшаем до 0.94 для более тонкого контура (было 0.97)
  const offsetX = (width * (1 - scale)) / 2;
  const offsetY = (height * (1 - scale)) / 2;
  
  edgeCtx.drawImage(
    maskCanvas, 
    0, 0, width, height,
    offsetX, offsetY, width * scale, height * scale
  );
  edgeCtx.restore();
  
  // Теперь edgeCanvas содержит только тонкий контур
  
  // Анимация контура: бегущий эффект свечения
  const gradientWidth = Math.max(width, height) * 0.2; // Уменьшаем размер градиента
  const angle = time * 2; // вращение градиента со временем
  
  // Центр градиента движется по кругу вокруг центра изображения
  const centerX = width/2 + Math.cos(angle) * width * 0.3;
  const centerY = height/2 + Math.sin(angle) * height * 0.3;
  
  // Создаем радиальный градиент для анимации контура
  const gradient = ctx.createRadialGradient(
    centerX, centerY, 0,
    centerX, centerY, gradientWidth
  );
  
  // Более яркие цвета контура в стиле cyberpunk
  gradient.addColorStop(0, 'rgba(0, 255, 255, 1.0)');    // Cyan - 100% непрозрачности
  gradient.addColorStop(0.3, 'rgba(150, 0, 255, 0.9)');  // Яркий фиолетовый
  gradient.addColorStop(0.7, 'rgba(255, 0, 100, 0.7)');  // Ярко-розовый
  gradient.addColorStop(1, 'rgba(0, 50, 255, 0)');       // Blue fadeout
  
  // Рисуем контур с градиентом
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = gradient;
  ctx.drawImage(edgeCanvas, 0, 0, width, height);
  ctx.restore();
  
  // Добавляем светящуюся линию по контуру с небольшой пульсацией
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  
  // Пульсирующее свечение - более сильное
  const pulseIntensity = 0.7 + 0.3 * Math.sin(time * 3); // От 0.7 до 1.0 (было 0.6-1.0)
  
  // Цикл по цветам свечения для создания эффекта переливающегося неона
  const glowTime = time * 0.5; // Ускоряем переливание цветов (было 0.3)
  const hue = (Math.sin(glowTime) * 0.5 + 0.5) * 360; // Hue от 0 до 360
  
  ctx.shadowColor = `hsla(${hue}, 100%, 70%, ${pulseIntensity})`;
  ctx.shadowBlur = 12; // Увеличиваем размер свечения (было 8)
  ctx.lineWidth = 1;
  ctx.strokeStyle = `hsla(${hue}, 100%, 80%, ${pulseIntensity})`;
  ctx.drawImage(edgeCanvas, 0, 0, width, height);
  
  // Добавляем небольшие смещенные копии контура для создания эффекта "дрожания"
  if (Math.random() < 0.3) { // Периодически добавляем эффект дрожания
    const jitterAmount = 3;
    const jitterX = (Math.random() - 0.5) * jitterAmount;
    const jitterY = (Math.random() - 0.5) * jitterAmount;
    
    // Меняем цвет для смещенной копии
    ctx.shadowColor = `hsla(${(hue + 180) % 360}, 100%, 70%, ${pulseIntensity * 0.7})`;
    
    // Рисуем смещенную копию
    ctx.drawImage(edgeCanvas, 0, 0, width, height, jitterX, jitterY, width, height);
  }
  
  ctx.restore();
}

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
    
    // Создаем текстуру для маски
    this.maskTexture = null;
    this.maskCanvas = null;
    this.maskCtx = null;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: this.data.intensity },
        cameraTexture: { value: this.cameraTexture },
        maskTexture: { value: null },
        resolution: { value: new THREE.Vector2(sharedCameraCanvas.width, sharedCameraCanvas.height) },
        radius: { value: this.data.radius },
        center: { value: new THREE.Vector2(0.5, 0.5) },
        hasVideo: { value: 0 },
        hasMask: { value: 0 }
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
        uniform sampler2D maskTexture;
        uniform vec2 resolution;
        uniform float radius;
        uniform vec2 center;
        uniform int hasVideo;
        uniform int hasMask;
        varying vec2 vUv;

        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }
        
        // Функция для обнаружения краев в маске
        float detectEdge(sampler2D mask, vec2 uv) {
          vec2 texelSize = vec2(1.0) / resolution;
          
          // Проверяем соседние пиксели
          float center = texture2D(mask, uv).r;
          float left = texture2D(mask, uv - vec2(texelSize.x, 0.0)).r;
          float right = texture2D(mask, uv + vec2(texelSize.x, 0.0)).r;
          float up = texture2D(mask, uv - vec2(0.0, texelSize.y)).r;
          float down = texture2D(mask, uv + vec2(0.0, texelSize.y)).r;
          
          // Если разница между центральным и любым соседним пикселем больше порога,
          // значит это край
          float diff = max(
            abs(center - left),
            max(abs(center - right),
              max(abs(center - up), abs(center - down))
            )
          );
          
          return smoothstep(0.1, 0.5, diff);
        }
        
        void main() {
          vec2 uv = vUv;
          vec4 maskColor = vec4(0.0);
          float maskValue = 0.0;
          float edgeValue = 0.0;
          
          // Если есть маска, получаем ее значение
          if (hasMask == 1) {
            maskColor = texture2D(maskTexture, vec2(uv.x, 1.0 - uv.y));
            maskValue = maskColor.r; // используем R канал как значение маски
            
            // Определяем, является ли пиксель частью края
            edgeValue = detectEdge(maskTexture, vec2(uv.x, 1.0 - uv.y));
          }
          
          // Если это край маски, применяем интенсивный эффект
          if (hasMask == 1 && (edgeValue > 0.2 || maskValue > 0.0)) {
            // Усиливаем эффект на краях
            float effectStrength = edgeValue * 2.0 + maskValue * 0.5;
            
            // Глитч-эффект, зависящий от времени и положения
            float noise = random(uv + time * 0.1) * 0.15 * effectStrength;
            float distortion = sin(uv.y * 50.0 + time * 3.0) * 0.03 * effectStrength;
            
            // Применяем искажение к координатам только по краям
            uv.x += distortion * intensity + noise;
            uv.y += noise * 0.5;
            
            // RGB сдвиг для имитации хроматических аберраций
            float rgbShift = sin(time + uv.y * 20.0) * 0.015 * effectStrength;
            
            // Получаем цвет с камеры для каждого канала отдельно
            vec2 rUv = vec2(uv.x + rgbShift, uv.y);
            vec2 gUv = vec2(uv.x, uv.y);
            vec2 bUv = vec2(uv.x - rgbShift, uv.y);
            
            // Переворачиваем Y координату для правильного отображения
            rUv.y = 1.0 - rUv.y;
            gUv.y = 1.0 - gUv.y;
            bUv.y = 1.0 - bUv.y;
            
            float r = texture2D(cameraTexture, rUv).r;
            float g = texture2D(cameraTexture, gUv).g;
            float b = texture2D(cameraTexture, bUv).b;
            
            vec3 color = vec3(r, g, b);
            
            // Добавляем свечение для краев
            color += vec3(0.1, 0.3, 0.7) * edgeValue * (sin(time * 2.0) * 0.2 + 0.8);
            
            // Прозрачность зависит от того, насколько это край
            float alpha = min(1.0, edgeValue * 3.0 + maskValue * 0.5);
            
            gl_FragColor = vec4(color, alpha);
          } else if (hasVideo == 1) {
            // Если вне маски, но есть видео - просто показываем видео
            vec3 color = texture2D(cameraTexture, vec2(uv.x, 1.0 - uv.y)).rgb;
            gl_FragColor = vec4(color, 0.0); // Прозрачность вне маски
          } else {
            // Если ничего нет - прозрачный результат
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

  tick: function (time) {
    // Обновляем общий canvas/texture
    updateSharedCameraTexture();
    
    // Обновляем текстуру маски если она доступна
    if (window.segmentationMask && this.material) {
      if (!this.maskTexture) {
        this.maskTexture = new THREE.Texture();
        this.maskTexture.minFilter = THREE.LinearFilter;
        this.maskTexture.magFilter = THREE.LinearFilter;
        this.maskTexture.format = THREE.RGBAFormat;
        this.maskTexture.generateMipmaps = false;
      }
      
      // Создаем временный canvas для текстуры маски
      if (!this.maskCanvas) {
        this.maskCanvas = document.createElement('canvas');
        this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });
      }
      
      // Обновляем размер если нужно
      if (this.maskCanvas.width !== window.segmentationMask.width || 
          this.maskCanvas.height !== window.segmentationMask.height) {
        this.maskCanvas.width = window.segmentationMask.width;
        this.maskCanvas.height = window.segmentationMask.height;
      }
      
      // Наносим маску на canvas
      this.maskCtx.putImageData(window.segmentationMask, 0, 0);
      
      // Обновляем текстуру
      this.maskTexture.image = this.maskCanvas;
      this.maskTexture.needsUpdate = true;
      
      // Обновляем uniform в шейдере
      this.material.uniforms.maskTexture.value = this.maskTexture;
      this.material.uniforms.hasMask.value = 1;
    } else if (this.material) {
      this.material.uniforms.hasMask.value = 0;
    }
    
    if (this.material) {
      this.material.uniforms.time.value = time / 1000;
      this.material.uniforms.intensity.value = this.data.intensity;
      this.material.uniforms.hasVideo.value = sharedVideo && sharedVideo.readyState === 4 ? 1 : 0;
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
    if (this.maskTexture) {
      this.maskTexture.dispose();
    }
    if (this.maskCanvas) {
      this.maskCanvas.width = 0;
      this.maskCanvas.height = 0;
    }
    this.video = null;
  }
});

// Функция загрузки модели DeepLab
async function loadDeepLabModel() {
  try {
    updateDebugInfo({ modelStatus: 'Загрузка моделей...', segmentationStatus: 'DeepLab: загрузка...' });

    // Проверяем, загружен ли уже TensorFlow.js
    if (!window.tf) {
      console.log('Загружаем TensorFlow.js из CDN');
      await new Promise((resolve, reject) => {
        // Проверяем, не добавлен ли уже скрипт на страницу
        if (document.querySelector('script[src*="tensorflow/tfjs"]')) {
          console.log('Скрипт TensorFlow.js уже добавлен, пропускаем');
          return resolve();
        }
        
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
    } else {
      console.log('TensorFlow.js уже загружен, пропускаем');
    }

    // Проверяем наличие и настройку WebGL бэкенда
    if (!window.tf?.backend || !window.tf.getBackend || window.tf.getBackend() !== 'webgl') {
      console.log('Настраиваем WebGL бэкенд');
      
      // Проверяем, не загружен ли уже бэкенд WebGL
      if (!document.querySelector('script[src*="tfjs-backend-webgl"]')) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl@3.21.0/dist/tf-backend-webgl.min.js';
          s.onload = resolve;
          s.onerror = () => { 
            updateDebugInfo({ errors: 'Ошибка загрузки tfjs-backend-webgl' }); 
            console.error('Ошибка загрузки tfjs-backend-webgl');
            reject(new Error('Ошибка загрузки tfjs-backend-webgl')); 
          };
          document.head.appendChild(s);
        });
      }

      try {
        // После загрузки скрипта устанавливаем бэкенд
        await window.tf.setBackend('webgl'); 
        await window.tf.ready();
        console.log('WebGL бэкенд успешно инициализирован');
      } catch (e) {
        updateDebugInfo({ errors: 'Ошибка инициализации tfjs-backend-webgl' });
        console.error('Ошибка инициализации tfjs-backend-webgl', e);
        throw e;
      }
    } else {
      console.log('WebGL бэкенд уже настроен, пропускаем');
    }

    // Загрузка DeepLab модели если не загружена
    if (!window.deeplab) {
      console.log('Загружаем DeepLab из CDN');
      
      // Проверяем, не добавлен ли уже скрипт на страницу
      if (!document.querySelector('script[src*="deeplab"]')) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/deeplab@0.2.1/dist/deeplab.min.js';
          s.onload = resolve;
          s.onerror = () => { 
            updateDebugInfo({ errors: 'Ошибка загрузки DeepLab' }); 
            console.error('Ошибка загрузки DeepLab');
            reject(new Error('Ошибка загрузки DeepLab')); 
          };
          document.head.appendChild(s);
        });
      } else {
        console.log('Скрипт DeepLab уже добавлен, пропускаем');
      }
    } else {
      console.log('DeepLab уже загружен, пропускаем');
    }

    // Инициализация модели только если еще не загружена
    if (!deepLabModel) {
      try {
        console.log('Инициализируем модель DeepLab');
        // Проверяем, доступен ли объект deeplab
        if (!window.deeplab || !window.deeplab.load) {
          throw new Error('Объект DeepLab недоступен или некорректен');
        }
        
        updateDebugInfo({ modelStatus: 'Загрузка модели DeepLab...' });
        
        // Используем Pascal VOC модель (стандартная, с 21 классом объектов)
        const modelOptions = {
          base: 'pascal', // или 'cityscapes', 'ade20k'
          quantizationBytes: 2 // для баланса между скоростью и точностью
        };
        
        console.log('Параметры загрузки модели DeepLab:', modelOptions);
        deepLabModel = await window.deeplab.load(modelOptions);
        
        console.log('Модель DeepLab успешно загружена:', deepLabModel);
        updateDebugInfo({ 
          segmentationStatus: 'DeepLab: загружена',
          modelStatus: 'Модель сегментации успешно загружена'
        });
      } catch (e) {
        updateDebugInfo({ 
          segmentationStatus: 'DeepLab: ошибка', 
          errors: `Ошибка инициализации DeepLab: ${e.message}`,
          modelStatus: 'Ошибка загрузки модели DeepLab'
        });
        console.error('Ошибка инициализации DeepLab', e);
        throw e;
      }
    } else {
      console.log('Модель DeepLab уже загружена, пропускаем');
      updateDebugInfo({ modelStatus: 'Модель сегментации уже загружена' });
    }
  } catch (error) {
    updateDebugInfo({ 
      modelStatus: 'Ошибка загрузки модели', 
      errors: `Ошибка: ${error.message}`,
      segmentationStatus: 'DeepLab: ошибка загрузки'
    });
    console.error('Ошибка загрузки модели:', error);
  }
}

// Регистрируем компонент glitch-effect после загрузки A-Frame
if (window.AFRAME) {
  registerGlitchEffect();
} else {
  // Если A-Frame еще не загружен, дожидаемся его загрузки
  document.addEventListener('aframe-loaded', registerGlitchEffect);
  window.addEventListener('load', function() {
    if (window.AFRAME) {
      registerGlitchEffect();
    }
  });
}

function registerGlitchEffect() {
  // Проверяем, не зарегистрирован ли уже компонент
  if (window.AFRAME.components && window.AFRAME.components['glitch-effect']) {
    console.log('Компонент glitch-effect уже зарегистрирован');
    return;
  }
  
  console.log('Регистрируем компонент glitch-effect');
  
  window.AFRAME.registerComponent('glitch-effect', {
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
      
      // Создаем текстуру для маски
      this.maskTexture = null;
      this.maskCanvas = null;
      this.maskCtx = null;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: this.data.intensity },
        cameraTexture: { value: this.cameraTexture },
          maskTexture: { value: null },
        resolution: { value: new THREE.Vector2(sharedCameraCanvas.width, sharedCameraCanvas.height) },
        radius: { value: this.data.radius },
        center: { value: new THREE.Vector2(0.5, 0.5) },
        hasVideo: { value: 0 },
          hasMask: { value: 0 }
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
          uniform sampler2D maskTexture;
        uniform vec2 resolution;
        uniform float radius;
        uniform vec2 center;
        uniform int hasVideo;
          uniform int hasMask;
        varying vec2 vUv;

        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }
          
          // Функция для обнаружения краев в маске
          float detectEdge(sampler2D mask, vec2 uv) {
            vec2 texelSize = vec2(1.0) / resolution;
            
            // Проверяем соседние пиксели
            float center = texture2D(mask, uv).r;
            float left = texture2D(mask, uv - vec2(texelSize.x, 0.0)).r;
            float right = texture2D(mask, uv + vec2(texelSize.x, 0.0)).r;
            float up = texture2D(mask, uv - vec2(0.0, texelSize.y)).r;
            float down = texture2D(mask, uv + vec2(0.0, texelSize.y)).r;
            
            // Если разница между центральным и любым соседним пикселем больше порога,
            // значит это край
            float diff = max(
              abs(center - left),
              max(abs(center - right),
                max(abs(center - up), abs(center - down))
              )
            );
            
            return smoothstep(0.1, 0.5, diff);
          }
          
        void main() {
          vec2 uv = vUv;
            vec4 maskColor = vec4(0.0);
            float maskValue = 0.0;
            float edgeValue = 0.0;
            
            // Если есть маска, получаем ее значение
            if (hasMask == 1) {
              maskColor = texture2D(maskTexture, vec2(uv.x, 1.0 - uv.y));
              maskValue = maskColor.r; // используем R канал как значение маски
              
              // Определяем, является ли пиксель частью края
              edgeValue = detectEdge(maskTexture, vec2(uv.x, 1.0 - uv.y));
            }
            
            // Если это край маски, применяем интенсивный эффект
            if (hasMask == 1 && (edgeValue > 0.2 || maskValue > 0.0)) {
              // Усиливаем эффект на краях
              float effectStrength = edgeValue * 2.0 + maskValue * 0.5;
              
              // Глитч-эффект, зависящий от времени и положения
              float noise = random(uv + time * 0.1) * 0.15 * effectStrength;
              float distortion = sin(uv.y * 50.0 + time * 3.0) * 0.03 * effectStrength;
              
              // Применяем искажение к координатам только по краям
              uv.x += distortion * intensity + noise;
              uv.y += noise * 0.5;
              
              // RGB сдвиг для имитации хроматических аберраций
              float rgbShift = sin(time + uv.y * 20.0) * 0.015 * effectStrength;
              
              // Получаем цвет с камеры для каждого канала отдельно
              vec2 rUv = vec2(uv.x + rgbShift, uv.y);
              vec2 gUv = vec2(uv.x, uv.y);
              vec2 bUv = vec2(uv.x - rgbShift, uv.y);
              
              // Переворачиваем Y координату для правильного отображения
              rUv.y = 1.0 - rUv.y;
              gUv.y = 1.0 - gUv.y;
              bUv.y = 1.0 - bUv.y;
              
              float r = texture2D(cameraTexture, rUv).r;
              float g = texture2D(cameraTexture, gUv).g;
              float b = texture2D(cameraTexture, bUv).b;
              
              vec3 color = vec3(r, g, b);
              
              // Добавляем свечение для краев
              color += vec3(0.1, 0.3, 0.7) * edgeValue * (sin(time * 2.0) * 0.2 + 0.8);
              
              // Прозрачность зависит от того, насколько это край
              float alpha = min(1.0, edgeValue * 3.0 + maskValue * 0.5);
              
              gl_FragColor = vec4(color, alpha);
            } else if (hasVideo == 1) {
              // Если вне маски, но есть видео - просто показываем видео
          vec3 color = texture2D(cameraTexture, vec2(uv.x, 1.0 - uv.y)).rgb;
              gl_FragColor = vec4(color, 0.0); // Прозрачность вне маски
          } else {
              // Если ничего нет - прозрачный результат
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

  tick: function (time) {
    // Обновляем общий canvas/texture
    updateSharedCameraTexture();
      
      // Обновляем текстуру маски если она доступна
      if (window.segmentationMask && this.material) {
        if (!this.maskTexture) {
          this.maskTexture = new THREE.Texture();
          this.maskTexture.minFilter = THREE.LinearFilter;
          this.maskTexture.magFilter = THREE.LinearFilter;
          this.maskTexture.format = THREE.RGBAFormat;
          this.maskTexture.generateMipmaps = false;
        }
        
        // Создаем временный canvas для текстуры маски
        if (!this.maskCanvas) {
          this.maskCanvas = document.createElement('canvas');
          this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });
        }
        
        // Обновляем размер если нужно
        if (this.maskCanvas.width !== window.segmentationMask.width || 
            this.maskCanvas.height !== window.segmentationMask.height) {
          this.maskCanvas.width = window.segmentationMask.width;
          this.maskCanvas.height = window.segmentationMask.height;
        }
        
        // Наносим маску на canvas
        this.maskCtx.putImageData(window.segmentationMask, 0, 0);
        
        // Обновляем текстуру
        this.maskTexture.image = this.maskCanvas;
        this.maskTexture.needsUpdate = true;
        
        // Обновляем uniform в шейдере
        this.material.uniforms.maskTexture.value = this.maskTexture;
        this.material.uniforms.hasMask.value = 1;
      } else if (this.material) {
        this.material.uniforms.hasMask.value = 0;
      }
      
    if (this.material) {
      this.material.uniforms.time.value = time / 1000;
      this.material.uniforms.intensity.value = this.data.intensity;
      this.material.uniforms.hasVideo.value = sharedVideo && sharedVideo.readyState === 4 ? 1 : 0;
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
      if (this.maskTexture) {
        this.maskTexture.dispose();
      }
      if (this.maskCanvas) {
        this.maskCanvas.width = 0;
        this.maskCanvas.height = 0;
      }
      this.video = null;
    }
  });
}

// Функция для тестирования модели DeepLab на простом кадре
async function testDeepLabModel() {
  if (!deepLabModel) {
    console.log('Модель DeepLab не загружена, тестирование невозможно');
    return false;
  }
  
  try {
    console.log('Тестирование модели DeepLab...');
    
    // Получаем видео элемент
    const video = document.querySelector('video');
    if (!video || video.readyState < 2) {
      console.log('Видео недоступно для тестирования');
      return false;
    }
    
    // Создаем временный canvas для тестового изображения
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 300;  // Меньший размер для быстрого теста
    testCanvas.height = 200;
    const testCtx = testCanvas.getContext('2d');
    
    // Рисуем текущий кадр видео
    testCtx.drawImage(video, 0, 0, testCanvas.width, testCanvas.height);
    
    // Тестируем сегментацию
    console.log('Вызываем DeepLab.segment() на тестовом изображении');
    const segmentationResult = await deepLabModel.segment(testCanvas);
    
    console.log('Результат тестовой сегментации:', segmentationResult);
    
    // Проверяем правильность формата результата
    if (!segmentationResult || !segmentationResult.segmentationMap) {
      console.error('Неверный формат результата сегментации');
      updateDebugInfo({ 
        segmentationStatus: 'DeepLab: ошибка теста',
        errors: 'Неверный формат результата сегментации'
      });
      return false;
    }
    
    // Проверка, что результат содержит правильные данные
    const segmentationMap = segmentationResult.segmentationMap;
    if (!segmentationMap || !segmentationMap.length) {
      console.error('Карта сегментации пуста');
      updateDebugInfo({ 
        segmentationStatus: 'DeepLab: ошибка теста',
        errors: 'Карта сегментации пуста'
      });
      return false;
    }
    
    // Находим уникальные классы в результате
    const uniqueClasses = new Set(segmentationMap);
    console.log('Найденные классы в тестовой сегментации:', Array.from(uniqueClasses));
    
    // Подсчитываем пиксели класса "человек" (индекс 15)
    let personPixels = 0;
    segmentationMap.forEach(classId => {
      if (classId === 15) personPixels++;
    });
    
    console.log(`Обнаружено ${personPixels} пикселей класса "человек" в тестовом изображении`);
    
    // Обновляем отладочную информацию
    updateDebugInfo({ 
      segmentationStatus: personPixels > 0 
        ? `DeepLab: тест пройден, обнаружен человек (${personPixels} пикс)` 
        : 'DeepLab: тест пройден, человек не обнаружен',
    });
    
    // Считаем тест успешным, даже если человек не обнаружен
    return true;
  } catch (error) {
    console.error('Ошибка при тестировании модели DeepLab:', error);
    updateDebugInfo({ 
      segmentationStatus: 'DeepLab: ошибка теста',
      errors: `Ошибка теста: ${error.message}`
    });
    return false;
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