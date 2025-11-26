<template>
  <div class="root">
    <div class="header">
      <div class="header-left">
        <span class="title">AE Timeline</span>
        <span class="meta">{{ store.project.width }}x{{ store.project.height }} | {{ store.project.fps }}fps</span>
      </div>
      <div class="header-center">
        <button class="btn" @click="store.togglePlayback">{{ store.isPlaying ? 'II' : '>' }}</button>
        <button class="btn" @click="store.stopPlayback">[]</button>
        <span class="time">{{ formatTime(store.currentTime) }}</span>
        <button class="btn green" @click="addKeyframe">+K</button>
        <button class="btn" @click="deleteKeyframe">-K</button>
        <button class="btn" :class="{active: store.maskMode.enabled}" @click="toggleMask">Mask</button>
        <button class="btn" :class="{active: store.pathMode.enabled}" @click="togglePath">Path</button>
      </div>
      <div class="header-right">
        <button class="btn blue" @click="save">Save</button>
        <button class="btn red" @click="close">X</button>
      </div>
    </div>
    <div class="left">
      <button class="tool" @click="addForeground" title="Add Foreground">+</button>
      <button class="tool" @click="addBackground" title="Add Background">BG</button>
      <div class="tool-sep"></div>
      <button class="tool" @click="moveUp" :disabled="!store.currentLayer">Up</button>
      <button class="tool" @click="moveDown" :disabled="!store.currentLayer">Dn</button>
    </div>
    <div class="center">
      <CanvasPreview />
    </div>
    <div class="right">
      <template v-if="store.currentLayer">
        <div class="panel-title">
          Layer {{ store.currentLayerIndex + 1 }}
          <button class="reset-btn" @click="resetLayer" title="Reset transform">R</button>
        </div>
        <div class="prop-group">
          <div class="prop-label">{{ store.currentLayer.type === 'background' ? 'Background' : 'Position' }}</div>
          <div class="prop-row" v-if="store.currentLayer.type === 'background'">
            <label>Mode</label>
            <select v-model="store.currentLayer.bg_mode">
              <option value="fit">Fit</option>
              <option value="fill">Fill</option>
              <option value="stretch">Stretch</option>
            </select>
          </div>
          <div class="prop-row">
            <label>X</label>
            <input type="number" v-model.number="store.currentLayer.x" step="1" />
          </div>
          <div class="prop-row">
            <label>Y</label>
            <input type="number" v-model.number="store.currentLayer.y" step="1" />
          </div>
        </div>
        <div class="prop-group">
          <div class="prop-label">Transform</div>
          <div class="prop-row">
            <label>Scale</label>
            <input type="range" min="0.1" max="3" step="0.01" v-model.number="store.currentLayer.scale" />
            <input type="number" v-model.number="store.currentLayer.scale" step="0.01" class="small" />
          </div>
          <div class="prop-row">
            <label>Rotation</label>
            <input type="range" min="-180" max="180" step="1" v-model.number="store.currentLayer.rotation" />
            <input type="number" v-model.number="store.currentLayer.rotation" step="1" class="small" />
          </div>
          <div class="prop-row">
            <label>Opacity</label>
            <input type="range" min="0" max="1" step="0.01" v-model.number="store.currentLayer.opacity" />
            <input type="number" v-model.number="store.currentLayer.opacity" step="0.01" min="0" max="1" class="small" />
          </div>
        </div>
        <div class="prop-group" v-if="store.currentLayer.type !== 'background'">
          <div class="prop-label">3D Transform</div>
          <div class="prop-row">
            <label>RotX</label>
            <input type="range" min="-90" max="90" step="1" v-model.number="store.currentLayer.rotationX" />
            <input type="number" v-model.number="store.currentLayer.rotationX" step="1" class="small" />
          </div>
          <div class="prop-row">
            <label>RotY</label>
            <input type="range" min="-90" max="90" step="1" v-model.number="store.currentLayer.rotationY" />
            <input type="number" v-model.number="store.currentLayer.rotationY" step="1" class="small" />
          </div>
          <div class="prop-row">
            <label>Persp</label>
            <input type="range" min="100" max="2000" step="50" v-model.number="store.currentLayer.perspective" />
            <input type="number" v-model.number="store.currentLayer.perspective" step="50" class="small" />
          </div>
        </div>
        <div class="prop-group" v-if="store.currentLayer.type !== 'background'">
          <div class="prop-label">Mask</div>
          <div class="prop-row">
            <label>Size</label>
            <input type="range" min="0" max="1" step="0.01" v-model.number="store.currentLayer.mask_size" />
            <input type="number" v-model.number="store.currentLayer.mask_size" step="0.01" min="0" max="1" class="small" />
          </div>
          <div class="prop-row">
            <label>Brush</label>
            <input type="range" min="5" max="100" step="1" v-model.number="store.maskMode.brush" />
            <button class="small-btn" :class="{active: store.maskMode.erase}" @click="store.maskMode.erase = !store.maskMode.erase">Erase</button>
          </div>
        </div>
        <div class="prop-group" v-if="store.currentLayer.type !== 'background'">
          <div class="prop-label">Path Animation</div>
          <div class="prop-row">
            <label>Enable</label>
            <input type="checkbox" v-model="store.currentLayer.usePathAnimation" />
            <button class="small-btn" @click="clearPath">Clear Path</button>
          </div>
          <div class="prop-row" v-if="store.currentLayer.bezierPath">
            <span style="color:#888">{{ store.currentLayer.bezierPath?.length || 0 }} points</span>
          </div>
        </div>
        <div class="help-text">
          <div>Drag: Move layer</div>
          <div>Wheel: Scale</div>
          <div>Shift+Wheel: Rotate</div>
          <div>Alt+Wheel: Opacity</div>
          <div>R: Reset transform</div>
        </div>
      </template>
      <template v-else>
        <div class="panel-title">Properties</div>
        <div class="no-selection">Select a layer to edit</div>
      </template>
    </div>
    <div class="footer">
      <div class="layers">
        <div class="layers-head">Layers</div>
        <div class="layers-body">
          <div v-for="(layer, i) in store.layers" :key="layer.id" class="layer" :class="{active: i === store.currentLayerIndex}" @click="store.selectLayer(i)">
            <span>{{ layer.type === 'background' ? 'BG' : 'FG' }}</span>
            <span class="layer-name">Layer {{ i + 1 }}</span>
            <button class="layer-del" @click.stop="store.removeLayer(i)">x</button>
          </div>
        </div>
      </div>
      <div class="tracks" ref="tracksRef" @mousedown="onTracksMouseDown" @mousemove="onTracksMouseMove" @mouseup="onTracksMouseUp" @mouseleave="onTracksMouseUp" @dblclick="onTracksDblClick">
        <div class="ruler">
          <div v-for="i in tickCount" :key="i" class="tick" :style="{left: ((i-1)/store.project.duration*100)+'%'}">{{ i-1 }}s</div>
        </div>
        <div class="tracks-body">
          <div v-for="(layer, i) in store.layers" :key="layer.id" class="track" :class="{active: i === store.currentLayerIndex}" @click.stop="onTrackClick(i, $event)">
            <div v-for="kf in getKfs(layer)" :key="kf.t+kf.p" class="kf" :style="{left: (kf.t/store.project.duration*100)+'%'}" @click.stop="onKeyframeClick(kf.t)" @contextmenu.prevent="onKeyframeRightClick(layer, kf)" :title="kf.p + ': ' + kf.v.toFixed(2)"></div>
          </div>
        </div>
        <div class="playhead" :style="{left: (store.currentTime/store.project.duration*100)+'%'}"></div>
        <div class="time-indicator">{{ formatTime(store.currentTime) }}</div>
      </div>
    </div>
    <input ref="fileInput" type="file" accept="image/*" multiple style="display:none" @change="onFile" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useTimelineStore } from '@/stores/timelineStore'
import CanvasPreview from '@/components/timeline/CanvasPreview.vue'

const props = defineProps<{ node: any }>()
const store = useTimelineStore()
const fileInput = ref<HTMLInputElement>()
const tracksRef = ref<HTMLDivElement>()
let pendingType: 'foreground' | 'background' = 'foreground'
let isDraggingTime = false

const tickCount = computed(() => Math.ceil(store.project.duration) + 1)

function formatTime(t: number) {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  const f = Math.floor((t % 1) * store.project.fps)
  return String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0') + ':' + String(f).padStart(2,'0')
}

function getKfs(layer: any) {
  const r: any[] = []
  const props = ['x','y','scale','rotation','opacity','mask_size']
  for (const p of props) {
    const frames = layer.keyframes?.[p] || []
    for (const f of frames) {
      r.push({ t: f.time, p: p, v: f.value })
    }
  }
  return r
}

// 时间轴交互
function getTimeFromEvent(e: MouseEvent) {
  if (!tracksRef.value) return 0
  const rect = tracksRef.value.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  return ratio * store.project.duration
}

function onTracksMouseDown(e: MouseEvent) {
  isDraggingTime = true
  store.setCurrentTime(getTimeFromEvent(e))
}

function onTracksMouseMove(e: MouseEvent) {
  if (!isDraggingTime) return
  store.setCurrentTime(getTimeFromEvent(e))
}

function onTracksMouseUp() {
  isDraggingTime = false
}

function onTrackClick(layerIndex: number, e: MouseEvent) {
  store.selectLayer(layerIndex)
  store.setCurrentTime(getTimeFromEvent(e))
}

function onTracksDblClick(e: MouseEvent) {
  // 双击添加关键帧
  if (store.currentLayer) {
    store.setCurrentTime(getTimeFromEvent(e))
    store.addKeyframe()
  }
}

function onKeyframeClick(time: number) {
  store.setCurrentTime(time)
}

function onKeyframeRightClick(layer: any, kf: any) {
  // 右键删除关键帧
  if (layer.keyframes && layer.keyframes[kf.p]) {
    layer.keyframes[kf.p] = layer.keyframes[kf.p].filter((k: any) => k.time !== kf.t)
  }
}

function save() {
  if (!props.node?.widgets) return
  const findWidget = (n: string) => props.node.widgets.find((x: any) => x.name === n)
  const anim = store.exportAnimation()
  const lw = findWidget('layers_keyframes')
  if (lw) lw.value = JSON.stringify(anim.layers)
  const ww = findWidget('width')
  if (ww) ww.value = store.project.width
  const hw = findWidget('height')
  if (hw) hw.value = store.project.height
  const fw = findWidget('fps')
  if (fw) fw.value = store.project.fps
  const tw = findWidget('total_frames')
  if (tw) tw.value = store.project.total_frames
}

function close() {
  save()
  const dialog = document.querySelector('.ae-timeline-dialog') as HTMLDialogElement
  if (dialog) dialog.close()
}

function addKeyframe() { store.addKeyframe() }
function deleteKeyframe() { store.deleteKeyframe() }
function toggleMask() { store.maskMode.enabled = !store.maskMode.enabled }
function togglePath() { store.pathMode.enabled = !store.pathMode.enabled }
function clearPath() { 
  if (store.currentLayer) {
    store.currentLayer.bezierPath = []
    store.currentLayer.usePathAnimation = false
  }
}

function addForeground() {
  pendingType = 'foreground'
  fileInput.value?.click()
}

function addBackground() {
  pendingType = 'background'
  fileInput.value?.click()
}

function onFile(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  Array.from(files).forEach((file, i) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const data = ev.target?.result as string
      store.addLayer({
        id: 'uploaded_' + Date.now() + '_' + i,
        name: file.name.replace(/\.[^/.]+$/, ''),
        type: pendingType,
        image_data: data,
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        opacity: 1,
        mask_size: 0,
        keyframes: {},
        bg_mode: 'fit'
      })
    }
    reader.readAsDataURL(file)
  })
  if (fileInput.value) fileInput.value.value = ''
}

function moveUp() { moveLayer(-1) }
function moveDown() { moveLayer(1) }

function moveLayer(d: number) {
  const i = store.currentLayerIndex
  if (i < 0) return
  const n = i + d
  if (n >= 0 && n < store.layers.length) {
    const l = store.layers[i]
    store.layers.splice(i, 1)
    store.layers.splice(n, 0, l)
    store.selectLayer(n)
  }
}

function resetLayer() {
  if (!store.currentLayer) return
  store.updateLayer(store.currentLayerIndex, {
    x: 0, y: 0, scale: 1, rotation: 0, opacity: 1
  })
}

onMounted(() => {
  if (!props.node) return
  
  // 清空旧数据，避免重新打开时数据混乱
  store.clearLayers()
  
  const findWidget = (n: string) => props.node.widgets?.find((x: any) => x.name === n)
  const lw = findWidget('layers_keyframes')
  if (lw?.value) {
    try {
      const layersData = JSON.parse(lw.value)
      if (Array.isArray(layersData) && layersData.length > 0) {
        store.loadAnimation({ layers: layersData })
      }
    } catch (e) {
      console.error('[Timeline] Failed to load layers:', e)
    }
  }
  store.setProject({
    width: findWidget('width')?.value || 1280,
    height: findWidget('height')?.value || 720,
    fps: findWidget('fps')?.value || 30,
    total_frames: findWidget('total_frames')?.value || 150
  })
})

onBeforeUnmount(() => {
  save()
})
</script>

<style>
.ae-vue-timeline-root {
  width: 100% !important;
  height: 100% !important;
}

.ae-vue-timeline-root .root {
  display: grid !important;
  grid-template-columns: 50px 1fr 220px !important;
  grid-template-rows: 44px 1fr 180px !important;
  grid-template-areas:
    "header header header"
    "left center right"
    "footer footer footer" !important;
  width: 100% !important;
  height: 100% !important;
  background: #1a1a1a;
  color: #ddd;
  font-family: -apple-system, sans-serif;
  font-size: 12px;
  box-sizing: border-box;
}
.ae-vue-timeline-root .header { grid-area: header; display: flex; align-items: center; justify-content: space-between; padding: 0 12px; background: #252525; border-bottom: 1px solid #333; }
.ae-vue-timeline-root .header-left, .ae-vue-timeline-root .header-center, .ae-vue-timeline-root .header-right { display: flex; align-items: center; gap: 8px; }
.ae-vue-timeline-root .title { font-weight: 600; color: #fff; }
.ae-vue-timeline-root .meta { color: #888; font-size: 11px; }
.ae-vue-timeline-root .time { font-family: monospace; color: #3a7bc8; min-width: 70px; }
.ae-vue-timeline-root .btn { padding: 5px 10px; background: #333; border: 1px solid #444; border-radius: 4px; color: #ccc; cursor: pointer; font-size: 11px; }
.ae-vue-timeline-root .btn:hover { background: #444; }
.ae-vue-timeline-root .btn.active { background: #3a7bc8; color: #fff; }
.ae-vue-timeline-root .btn.green { background: #2d5a3d; }
.ae-vue-timeline-root .btn.blue { background: #3a7bc8; color: #fff; }
.ae-vue-timeline-root .btn.red { background: #c83a3a; color: #fff; }
.ae-vue-timeline-root .left { grid-area: left !important; display: flex; flex-direction: column; gap: 4px; padding: 8px; background: #222; border-right: 1px solid #333; }
.ae-vue-timeline-root .tool { width: 34px; height: 34px; background: #333; border: 1px solid #444; border-radius: 4px; color: #ccc; cursor: pointer; font-size: 12px; }
.ae-vue-timeline-root .tool:hover { background: #444; }
.ae-vue-timeline-root .tool:disabled { opacity: 0.5; }
.ae-vue-timeline-root .tool-sep { height: 1px; background: #444; margin: 4px 0; }
.ae-vue-timeline-root .center { grid-area: center !important; display: flex; align-items: center; justify-content: center; background: #111; overflow: hidden; }
.ae-vue-timeline-root .right { grid-area: right !important; padding: 12px; background: #222; border-left: 1px solid #333; overflow-y: auto; }
.ae-vue-timeline-root .panel-title { font-weight: 600; color: #fff; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #444; }
.ae-vue-timeline-root .row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.ae-vue-timeline-root .row label { color: #888; font-size: 11px; }
.ae-vue-timeline-root .row input, .ae-vue-timeline-root .row select { width: 80px; padding: 4px 6px; background: #1a1a1a; border: 1px solid #444; border-radius: 3px; color: #fff; font-size: 11px; }
.ae-vue-timeline-root .no-selection { color: #666; font-size: 11px; text-align: center; padding: 20px 0; }
.ae-vue-timeline-root .footer { grid-area: footer !important; display: flex; background: #1e1e1e; border-top: 1px solid #333; }
.ae-vue-timeline-root .layers { width: 160px; border-right: 1px solid #333; display: flex; flex-direction: column; }
.ae-vue-timeline-root .layers-head { height: 28px; padding: 0 8px; background: #252525; border-bottom: 1px solid #333; display: flex; align-items: center; color: #888; font-size: 11px; }
.ae-vue-timeline-root .layers-body { flex: 1; overflow-y: auto; }
.ae-vue-timeline-root .layer { display: flex; align-items: center; height: 32px; padding: 0 8px; border-bottom: 1px solid #2a2a2a; cursor: pointer; gap: 6px; }
.ae-vue-timeline-root .layer:hover { background: #2a2a2a; }
.ae-vue-timeline-root .layer.active { background: #3a5070; }
.ae-vue-timeline-root .layer-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ae-vue-timeline-root .layer-del { opacity: 0; background: none; border: none; color: #888; cursor: pointer; }
.ae-vue-timeline-root .layer:hover .layer-del { opacity: 1; }
.ae-vue-timeline-root .layer-del:hover { color: #f44; }
.ae-vue-timeline-root .tracks { flex: 1; position: relative; cursor: pointer; display: flex; flex-direction: column; }
.ae-vue-timeline-root .ruler { height: 28px; background: #252525; border-bottom: 1px solid #333; position: relative; }
.ae-vue-timeline-root .tick { position: absolute; top: 0; height: 100%; border-left: 1px solid #444; padding-left: 4px; font-size: 10px; color: #666; display: flex; align-items: center; }
.ae-vue-timeline-root .tracks-body { flex: 1; position: relative; overflow-y: auto; }
.ae-vue-timeline-root .track { height: 32px; border-bottom: 1px solid #2a2a2a; position: relative; }
.ae-vue-timeline-root .track.active { background: #2a3545; }
.ae-vue-timeline-root .kf { position: absolute; top: 50%; transform: translate(-50%, -50%) rotate(45deg); width: 10px; height: 10px; background: #3498db; border: 1px solid #5dade2; }
.ae-vue-timeline-root .playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: #e74c3c; z-index: 10; pointer-events: none; }
.ae-vue-timeline-root .time-indicator { position: absolute; top: 2px; left: 50%; transform: translateX(-50%); background: #e74c3c; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 3px; pointer-events: none; z-index: 11; }
.ae-vue-timeline-root .kf { cursor: pointer; transition: transform 0.1s; }
.ae-vue-timeline-root .kf:hover { transform: translate(-50%, -50%) rotate(45deg) scale(1.3); background: #5dade2; }
.ae-vue-timeline-root .canvas-preview { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
.ae-vue-timeline-root .canvas-preview canvas { box-shadow: 0 4px 24px rgba(0,0,0,0.5); cursor: move; max-width: 100%; max-height: 100%; }

/* Property Panel Styles */
.ae-vue-timeline-root .panel-title { display: flex; justify-content: space-between; align-items: center; }
.ae-vue-timeline-root .reset-btn { padding: 2px 6px; background: #444; border: 1px solid #555; border-radius: 3px; color: #aaa; cursor: pointer; font-size: 10px; }
.ae-vue-timeline-root .reset-btn:hover { background: #555; color: #fff; }
.ae-vue-timeline-root .prop-group { margin-bottom: 12px; }
.ae-vue-timeline-root .prop-label { color: #888; font-size: 10px; text-transform: uppercase; margin-bottom: 6px; }
.ae-vue-timeline-root .prop-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.ae-vue-timeline-root .prop-row label { width: 50px; color: #888; font-size: 11px; flex-shrink: 0; }
.ae-vue-timeline-root .prop-row input[type="range"] { flex: 1; height: 4px; background: #333; border-radius: 2px; cursor: pointer; }
.ae-vue-timeline-root .prop-row input[type="number"] { width: 60px; padding: 3px 5px; background: #1a1a1a; border: 1px solid #444; border-radius: 3px; color: #fff; font-size: 11px; }
.ae-vue-timeline-root .prop-row input[type="number"].small { width: 45px; }
.ae-vue-timeline-root .prop-row input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; }
.ae-vue-timeline-root .prop-row select { flex: 1; padding: 3px 5px; background: #1a1a1a; border: 1px solid #444; border-radius: 3px; color: #fff; font-size: 11px; }
.ae-vue-timeline-root .small-btn { padding: 3px 8px; background: #333; border: 1px solid #444; border-radius: 3px; color: #aaa; cursor: pointer; font-size: 10px; }
.ae-vue-timeline-root .small-btn:hover { background: #444; color: #fff; }
.ae-vue-timeline-root .small-btn.active { background: #3498db; color: #fff; border-color: #5dade2; }
.ae-vue-timeline-root .help-text { margin-top: 16px; padding-top: 12px; border-top: 1px solid #333; color: #555; font-size: 10px; line-height: 1.6; }
</style>
