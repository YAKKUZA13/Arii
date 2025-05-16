/**
 * AR Шейдерные эффекты
 * Содержит компоненты и утилиты для работы с эффектами дополненной реальности
 */

// --- Общий canvas и texture для glitch-effect ---
let sharedCameraCanvas = null;
let sharedCameraCtx = null;
let sharedCameraTexture = null;
let sharedVideo = null;

/**
 * Создает и гарантирует наличие общей текстуры камеры для всех эффектов
 */
export function ensureSharedCameraTexture() {
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

/**
 * Обновляет общую текстуру камеры текущим кадром видео
 */
export function updateSharedCameraTexture() {
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

/**
 * Регистрирует компонент эффекта глюка для A-Frame
 */
export function registerGlitchEffect() {
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
            // x += widthReduction; // смещаем влево на 5% от ширины
            // w -= widthReduction * 2; // уменьшаем ширину на 10% (5% слева + 5% справа)
            
            // Корректировка смещения в зависимости от устройства
            if (this.isMobile) {
              // На мобильных устройствах меньшее смещение
              x += 30;
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
}

/**
 * Регистрирует компонент установки порядка рендеринга для A-Frame
 */
export function registerRenderingOrder() {
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
} 