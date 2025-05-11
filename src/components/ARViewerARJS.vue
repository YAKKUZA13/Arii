<template>
  <div class="ar-container">
    <a-scene
      embedded
      arjs="sourceType: webcam; debugUIEnabled: false; detectionMode: mono_and_matrix; matrixCodeType: 3x3;"
      renderer="logarithmicDepthBuffer: true;"
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

      <a-entity id="camera-wrapper" camera look-controls>
        <a-entity 
          cursor="rayOrigin: mouse; fuse: false"
          position="0 0 -1"
          geometry="primitive: ring; radiusInner: 0.02; radiusOuter: 0.03"
          material="color: #CCC; shader: flat">
        </a-entity>
        <a-entity 
          id="glitch-overlay"
          geometry="primitive: plane; width: 4; height: 3"
          material="shader: glitch; transparent: true; visible: false">
        </a-entity>
      </a-entity>

      <a-entity id="detected-markers"></a-entity>
    </a-scene>

    <div v-if="!isSupported" class="ar-not-supported">
      Ваше устройство не поддерживает AR. Пожалуйста, используйте современный браузер с поддержкой AR.js.
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as tf from '@tensorflow/tfjs'
import * as cocoSsd from '@tensorflow-models/coco-ssd'

const isSupported = ref(true)
const model = ref(null)
const video = ref(null)
const canvas = ref(null)
const ctx = ref(null)
const animationFrame = ref(null)
const intensity = ref(0.7)

// Регистрация кастомного шейдера
AFRAME.registerShader('glitch', {
  schema: {
    time: { type: 'time', is: 'uniform' },
    maskTexture: { type: 'map', is: 'uniform' },
    intensity: { type: 'number', default: 0.5 }
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
    uniform sampler2D maskTexture;
    uniform float intensity;
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
        gl_FragColor = vec4(0.0);
      }
    }
  `
})

onMounted(async () => {
  // Проверка поддержки WebGL
  const canvasCheck = document.createElement('canvas')
  const gl = canvasCheck.getContext('webgl') || canvasCheck.getContext('experimental-webgl')
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

  AFRAME.registerComponent('draggable', {
    init: function() {
      this.el.setAttribute('gesture-handler', {
        dragEnabled: true,
        dragAxis: 'xyz',
        dragThreshold: 0.1
      })
    }
  })

  AFRAME.registerComponent('scalable', {
    init: function() {
      this.el.setAttribute('gesture-handler', {
        pinchEnabled: true,
        pinchScaleFactor: 0.75
      })
    }
  })

  AFRAME.registerComponent('rotatable', {
    init: function() {
      this.el.setAttribute('gesture-handler', {
        rotateEnabled: true,
        rotateSpeed: 0.5
      })
    }
  })

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

#glitch-overlay {
  pointer-events: none;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9999;
}
</style>