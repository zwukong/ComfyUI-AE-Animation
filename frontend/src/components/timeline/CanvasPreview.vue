<template>
  <div class="canvas-preview" ref="containerRef">
    <div class="canvas-wrapper">
      <canvas 
        ref="canvasRef"
        :width="store.project.width"
        :height="store.project.height"
        class="render-canvas"
      />
      <canvas 
        ref="interactionCanvasRef"
        :width="store.project.width"
        :height="store.project.height"
        class="interaction-canvas"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @wheel.prevent="onWheel"
        @contextmenu.prevent
        tabindex="0"
        @keydown="onKeyDown"
      />
      <div class="canvas-info">
        <span v-if="store.currentLayer">
          Layer {{ store.currentLayerIndex + 1 }} | X:{{ Math.round(store.currentLayer.x || 0) }} Y:{{ Math.round(store.currentLayer.y || 0) }} S:{{ (store.currentLayer.scale || 1).toFixed(2) }} R:{{ Math.round(store.currentLayer.rotation || 0) }}°
        </span>
        <span v-else>No layer selected</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { useTimelineStore } from '@/stores/timelineStore'
import { useCanvasRenderer } from '@/composables/useCanvasRenderer'
import { useCanvasInteraction } from '@/composables/useCanvasInteraction'

const store = useTimelineStore()
const canvasRef = ref<HTMLCanvasElement>()
const interactionCanvasRef = ref<HTMLCanvasElement>()
const containerRef = ref<HTMLDivElement>()

const renderer = useCanvasRenderer(store, canvasRef, interactionCanvasRef)
const {
  initContexts,
  scheduleRender,
  getCachedImage,
  getLayerProps,
  setDrawExtractOverlayOnCtx,
  cleanup
} = renderer

const interaction = useCanvasInteraction(
  store,
  canvasRef,
  interactionCanvasRef,
  scheduleRender,
  getLayerProps,
  getCachedImage
)

const {
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel,
  onKeyDown,
  clearExtractSelection,
  applyExtractSelection,
  drawExtractOverlayOnCtx
} = interaction

setDrawExtractOverlayOnCtx(drawExtractOverlayOnCtx)

onMounted(() => {
  initContexts()
  scheduleRender()
})

onUnmounted(() => {
  cleanup()
})

watch(() => [store.layers, store.currentLayer, store.currentTime], () => {
  scheduleRender()
}, { deep: true })

watch(() => store.project, () => {
  scheduleRender()
}, { deep: true })

watch(() => store.extractMode.enabled, () => {
  scheduleRender()
})

watch(() => [store.maskMode.enabled, store.pathMode.enabled], () => {
  scheduleRender()
})

defineExpose({
  clearExtractSelection,
  applyExtractSelection
})
</script>

<style scoped>
.canvas-preview {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: visible;
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  flex: 1 1 auto;
}

.canvas-wrapper {
  position: relative;
  display: inline-block;
}

.render-canvas {
  display: block;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  outline: none;
  will-change: contents;
  image-rendering: -webkit-optimize-contrast;
  box-sizing: border-box;
}

.interaction-canvas {
  position: absolute;
  top: 0;
  left: 0;
  cursor: move;
  outline: none;
  box-sizing: border-box;
  z-index: 10;
  background: transparent;
}

.interaction-canvas:focus {
  outline: 2px solid #3a7bc8;
}

canvas {
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  cursor: move;
  outline: none;
  will-change: contents;
  transform: translateZ(0);
  image-rendering: -webkit-optimize-contrast;
  box-sizing: border-box;
  display: block;
  contain: layout style paint;
}

canvas:focus {
  box-shadow: 0 0 0 2px #3a7bc8, 0 4px 24px rgba(0, 0, 0, 0.5);
}

.canvas-info {
  position: relative;
  margin-top: 8px;
  margin-left: auto;
  margin-right: auto;
  width: fit-content;
  background: rgba(0, 0, 0, 0.8);
  color: #aaa;
  font-size: 11px;
  padding: 4px 12px;
  border-radius: 4px;
  white-space: nowrap;
  z-index: 20;
  pointer-events: auto;
  text-align: center;
  display: flex;
  align-items: center;
  gap: 10px;
}
</style>
