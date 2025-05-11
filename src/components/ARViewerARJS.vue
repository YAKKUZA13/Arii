<template>
  <div class="ar-container">
    <a-scene
      embedded
      arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix; matrixCodeType: 3x3;"
      
    >
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
    pinchEnabled: true"
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

      <a-entity 
        id="glitch-overlay"
        geometry="primitive: plane; width: 0.3; height: 0.2"
        material="transparent: true; opacity: 0.9"
        position="0.8 0.6 -1.5"
        glitch-effect="intensity: 0.5; offsetX: 0.7; offsetY: 0.6">
      </a-entity>

  </a-scene>

    <!-- Сообщение о неподдерживаемом устройстве -->
    <div v-if="!isSupported" class="ar-not-supported">
      Ваше устройство не поддерживает AR. Пожалуйста, используйте современный браузер с поддержкой AR.js.
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
//import AFRAME from 'aframe';
const isSupported = ref(true)
const marker = ref(null)
const model = ref(null)
const fixedModelPosition = ref(null)



AFRAME.registerComponent('glitch-effect', {
  schema: {
    intensity: { type: 'number', default: 0.5 },
    offsetX: { type: 'number', default: 0.7 },
    offsetY: { type: 'number', default: 0.6 }
  },

  init: function () {
    const el = this.el;
    const scene = el.sceneEl;
    const camera = document.querySelector('[camera]').components.camera;

    // Создаем рендер-таргет
    this.renderTarget = new THREE.WebGLRenderTarget(
      window.innerWidth,
      window.innerHeight
    );

    // Создаем шейдерный материал
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        intensity: { value: this.data.intensity },
        maskTexture: { value: this.renderTarget.texture },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
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
        uniform sampler2D maskTexture;
        varying vec2 vUv;

        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
        }

        void main() {
          vec4 mask = texture2D(maskTexture, vUv);
          
          if (mask.r > 0.5) {
            vec2 uv = vUv;
            float glitchIntensity = intensity * 0.1;
            
            uv.x += (random(vec2(time)) - 0.5) * glitchIntensity;
            uv.y += (random(vec2(time * 0.7)) - 0.5) * glitchIntensity;
            
            vec3 color;
            color.r = texture2D(maskTexture, uv + vec2(glitchIntensity * 0.02, 0.0)).r;
            color.g = texture2D(maskTexture, uv + vec2(0.0, glitchIntensity * 0.02)).g;
            color.b = texture2D(maskTexture, uv - vec2(glitchIntensity * 0.02, 0.0)).b;
            
            gl_FragColor = vec4(color, 1.0);
          } else {
            discard;
          }
        }
      `,
      transparent: true
    });

    // Применяем материал к entity
    scene.addEventListener('renderstart', () => {
      const mesh = el.getObject3D('mesh');
      if (mesh) {
        mesh.material = this.material;
      }
    });

    // Обновляем размеры рендер-таргета при изменении окна
    window.addEventListener('resize', () => {
      this.renderTarget.setSize(window.innerWidth, window.innerHeight);
    });
  },

  tick: function (time) {
    this.material.uniforms.time.value = time / 1000;
    this.material.uniforms.intensity.value = this.data.intensity;
  }
});

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

  AFRAME.registerComponent('clickable', {
    init: function() {
      this.el.addEventListener('click', (e) => {
        const animation = this.el.components.animation
        if (animation) {
          animation.pause()
          setTimeout(() => animation.play(), 1000)
        }
      })
    }
  })

  // Компонент для перетаскивания
  AFRAME.registerComponent('draggable', {
    init: function() {
      this.el.setAttribute('gesture-handler', {
        dragEnabled: true,
        dragAxis: 'xyz',
        dragThreshold: 0.1
      })
    }
  })

  // Компонент для масштабирования
  AFRAME.registerComponent('scalable', {
    init: function() {
      this.el.setAttribute('gesture-handler', {
        pinchEnabled: true,
        pinchScaleFactor: 0.75
      })
    }
  })

  // Компонент для вращения
  AFRAME.registerComponent('rotatable', {
    init: function() {
      this.el.setAttribute('gesture-handler', {
        rotateEnabled: true,
        rotateSpeed: 0.5
      })
    }
  })

  // Компонент для hover-эффектов
  AFRAME.registerComponent('hoverable', {
    schema: {
      hoverProperty: { type: 'string', default: 'scale' },
      hoverValue: { type: 'vec3', default: '0.6 0.6 0.6' },
      originalValue: { type: 'vec3', default: '0.5 0.5 0.5' }
    },

    init: function() {
      const data = this.data
      this.el.addEventListener('mouseenter', () => {
        this.el.setAttribute(data.hoverProperty, data.hoverValue)
      })
      
      this.el.addEventListener('mouseleave', () => {
        this.el.setAttribute(data.hoverProperty, data.originalValue)
      })
    }
  })

  // Инициализация жестов
  AFRAME.registerComponent('gesture-handler', {
    schema: {
      enabled: { default: true },
      dragEnabled: { default: true },
      rotateEnabled: { default: true },
      pinchEnabled: { default: true }
    },

    init: function() {
      this.onDrag = this.onDrag.bind(this)
      this.onRotate = this.onRotate.bind(this)
      this.onPinch = this.onPinch.bind(this)

      if (this.data.dragEnabled) {
        this.el.sceneEl.addEventListener('onefingermove', this.onDrag)
      }
      
      if (this.data.rotateEnabled) {
        this.el.sceneEl.addEventListener('twofingermove', this.onRotate)
      }
      
      if (this.data.pinchEnabled) {
        this.el.sceneEl.addEventListener('twofingermove', this.onPinch)
      }
    },

    onDrag: function(event) {
      const deltaX = event.detail.positionChange.x * 0.05
      const deltaY = event.detail.positionChange.y * 0.05
      const position = this.el.getAttribute('position')
      this.el.setAttribute('position', {
        x: position.x + deltaX,
        y: position.y - deltaY,
        z: position.z
      })
    },

    onRotate: function(event) {
      const rotation = this.el.getAttribute('rotation')
      const angle = rotation.y + event.detail.angleChange * 2
      this.el.setAttribute('rotation', { y: angle })
    },

    onPinch: function(event) {
      const scale = this.el.getAttribute('scale')
      const newScale = scale.x + event.detail.spreadChange * 0.001
      this.el.setAttribute('scale', { x: newScale, y: newScale, z: newScale })
    }
  })

})
</script>

<style scoped>
#glitch-overlay {
  position: fixed;
  top: 20%;
  right: 5%;
  width: 30%;
  height: 20%;
  pointer-events: none;
  z-index: 9999;
}
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