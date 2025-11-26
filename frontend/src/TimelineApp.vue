<template>
  <div class="root">
    <!-- 1. 画布区域（顶部大区域）-->
    <div class="canvas-area">
      <CanvasPreview />
    </div>
    
    <!-- 2. 所有的功能按钮（横向排列，居中）-->
    <div class="toolbar-area">
      <div class="toolbar-center">
        <button class="tb-btn" @click="addForeground" title="添加前景图层">+ Layer</button>
        <button class="tb-btn" @click="addBackground" title="添加背景图层">+ BG</button>
        <span class="tb-sep"></span>
        <button class="tb-btn" @click="store.setCurrentTime(0)" title="回到起点">|◀</button>
        <button class="tb-btn" :class="{active: store.isPlaying}" @click="store.togglePlayback" title="播放/暂停">
          {{ store.isPlaying ? '■' : '▶' }}
        </button>
        <span class="tb-sep"></span>
        <button class="tb-btn accent" @click="addKeyframe" title="添加关键帧 (K)">◆ Key</button>
        <button class="tb-btn" @click="deleteCurrentKeyframe" title="删除关键帧">✕ Key</button>
        <span class="tb-sep"></span>
        <button class="tb-btn" :class="{active: store.maskMode.enabled}" @click="toggleMask" title="遮罩绘制模式">🖌 Mask</button>
        <button class="tb-btn" :class="{active: store.pathMode.enabled}" @click="togglePath" title="路径动画模式">📍 Path</button>
        <button class="tb-btn" :class="{active: store.extractMode.enabled}" @click="store.extractMode.enabled = !store.extractMode.enabled" title="背景提取模式">✂ Extract</button>
        <span class="tb-sep"></span>
        <span class="tb-time">{{ formatTime(store.currentTime) }} / {{ formatTime(store.project.duration) }}</span>
        <button class="tb-btn save" @click="save">保存</button>
        <button class="tb-btn close" @click="close">✕</button>
      </div>
    </div>
    
    <!-- 3. 参数调整以及显示区域（横向，可编辑）-->
    <div class="params-area">
      <template v-if="store.currentLayer">
        <span class="param-label">Layer {{ store.currentLayerIndex + 1 }} ({{ store.currentLayer.type === 'background' ? 'BG' : 'FG' }})</span>
        
        <div class="param-group">
          <label>X</label>
          <input type="number" :value="currentLayerProps.x.toFixed(0)" @input="updateProp('x', $event)" step="1" class="param-input" />
        </div>
        <div class="param-group">
          <label>Y</label>
          <input type="number" :value="currentLayerProps.y.toFixed(0)" @input="updateProp('y', $event)" step="1" class="param-input" />
        </div>
        <div class="param-group">
          <label>Scale</label>
          <input type="number" :value="currentLayerProps.scale.toFixed(2)" @input="updateProp('scale', $event)" step="0.01" min="0.1" max="5" class="param-input" />
        </div>
        <div class="param-group">
          <label>Rotate</label>
          <input type="number" :value="currentLayerProps.rotation.toFixed(0)" @input="updateProp('rotation', $event)" step="1" class="param-input" />
        </div>
        <div class="param-group">
          <label>Opacity</label>
          <input type="range" :value="currentLayerProps.opacity" @input="updateProp('opacity', $event)" min="0" max="1" step="0.01" class="param-slider" />
          <span class="param-value">{{ (currentLayerProps.opacity * 100).toFixed(0) }}%</span>
        </div>
      </template>
      <template v-else>
        <span class="param-empty">请选择一个图层</span>
      </template>
    </div>
    
    <!-- 4. 底部：图层选项 + timeline -->
    <div class="bottom-area">
      <!-- 左侧：图层选项 -->
      <div class="layers-sidebar">
        <div class="layers-header">
          <span>Layers ({{ store.layers.length }})</span>
          <div class="layer-actions">
            <button class="layer-btn" @click="moveUp" :disabled="!store.currentLayer" title="上移">▲</button>
            <button class="layer-btn" @click="moveDown" :disabled="!store.currentLayer" title="下移">▼</button>
          </div>
        </div>
        <div class="layers-list">
          <div v-for="(layer, i) in store.layers" :key="layer.id" 
               class="layer-item" 
               :class="{active: i === store.currentLayerIndex}"
               @click="store.selectLayer(i)">
            <span class="layer-badge" :class="layer.type">{{ layer.type === 'background' ? 'BG' : 'FG' }}</span>
            <span class="layer-name">Layer {{ i + 1 }}</span>
            <button class="layer-del" @click.stop="store.removeLayer(i)">×</button>
          </div>
        </div>
      </div>
      
      <!-- 右侧：timeline，关键帧等显示 -->
      <div class="timeline-area" ref="timelineRef">
        <!-- 时间标尺（可点击/拖拽跳转）-->
        <div class="timeline-ruler" 
             @mousedown="onRulerMouseDown" 
             @mousemove="onRulerMouseMove" 
             @mouseup="onRulerMouseUp"
             @mouseleave="onRulerMouseUp">
          <div v-for="i in Math.ceil(store.project.duration) + 1" :key="i" 
               class="tick" 
               :style="{left: ((i-1)/store.project.duration*100)+'%'}">
            {{ i-1 }}s
          </div>
          <div class="playhead-top" :style="{left: (store.currentTime/store.project.duration*100)+'%'}"></div>
        </div>
        
        <!-- 属性轨道 -->
        <div class="timeline-tracks" @dblclick="onTrackDblClick">
          <template v-for="(layer, layerIdx) in store.layers" :key="layer.id">
            <!-- 图层标题行 -->
            <div class="track-header" 
                 :class="{active: layerIdx === store.currentLayerIndex, expanded: expandedLayers.has(layerIdx)}"
                 @click="store.selectLayer(layerIdx)">
              <button class="track-expand" @click.stop="toggleLayerExpand(layerIdx)">
                {{ expandedLayers.has(layerIdx) ? '▼' : '▶' }}
              </button>
              <span class="track-name">{{ layer.type === 'background' ? 'BG' : 'Layer ' + (layerIdx + 1) }}</span>
            </div>
            
            <!-- 属性行（展开时显示）-->
            <template v-if="expandedLayers.has(layerIdx)">
              <div v-for="prop in animatableProps" :key="prop.key" 
                   class="track-prop"
                   :class="{active: layerIdx === store.currentLayerIndex}"
                   @click="store.selectLayer(layerIdx)">
                <span class="prop-name">{{ prop.label }}</span>
                <div class="prop-track" 
                     @dblclick.stop="addKeyframeAt($event, layerIdx, prop.key)">
                  <!-- 该属性的关键帧 -->
                  <div v-for="kf in getPropertyKeyframes(layer, prop.key)" :key="kf.time"
                       class="keyframe"
                       :class="{selected: isKeyframeSelected(layerIdx, prop.key, kf.time)}"
                       :style="{left: (kf.time/store.project.duration*100)+'%'}"
                       :title="prop.label + ': ' + formatValue(kf.value, prop.key) + ' @ ' + kf.time.toFixed(2) + 's'"
                       @mousedown.stop="onKeyframeDragStart($event, layerIdx, prop.key, kf)"
                       @click.stop="selectKeyframe(layerIdx, prop.key, kf.time)"
                       @contextmenu.prevent="deleteKeyframe(layerIdx, prop.key, kf.time)">
                  </div>
                </div>
              </div>
            </template>
          </template>
        </div>
        
        <!-- 播放头 -->
        <div class="playhead" :style="{left: (store.currentTime/store.project.duration*100)+'%'}"></div>
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
const timelineRef = ref<HTMLDivElement>()
let pendingType: 'foreground' | 'background' = 'foreground'
let isDraggingRuler = false
let isDraggingKeyframe = false
let draggingKeyframeData: { layerIdx: number, prop: string, originalTime: number } | null = null

// 展开的图层
const expandedLayers = ref<Set<number>>(new Set([0]))

// 选中的关键帧
const selectedKeyframe = ref<{ layerIdx: number, prop: string, time: number } | null>(null)

// 可动画的属性
const animatableProps = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'scale', label: 'Scale' },
  { key: 'rotation', label: 'Rotate' },
  { key: 'opacity', label: 'Opacity' }
]

const tickCount = computed(() => Math.ceil(store.project.duration) + 1)

// 当前图层的插值属性（用于显示）
const currentLayerProps = computed(() => {
  const layer = store.currentLayer
  if (!layer) return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }
  
  const time = store.currentTime
  const kf = layer.keyframes || {}
  
  return {
    x: interpolateValue(kf.x, time, layer.x || 0),
    y: interpolateValue(kf.y, time, layer.y || 0),
    scale: interpolateValue(kf.scale, time, layer.scale || 1),
    rotation: interpolateValue(kf.rotation, time, layer.rotation || 0),
    opacity: interpolateValue(kf.opacity, time, layer.opacity ?? 1)
  }
})

// 关键帧插值
function interpolateValue(keyframes: any[], time: number, defaultValue: number): number {
  if (!keyframes || keyframes.length === 0) return defaultValue
  
  const sorted = [...keyframes].sort((a, b) => a.time - b.time)
  
  if (time <= sorted[0].time) return sorted[0].value
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value
  
  for (let i = 0; i < sorted.length - 1; i++) {
    if (time >= sorted[i].time && time <= sorted[i + 1].time) {
      const t = (time - sorted[i].time) / (sorted[i + 1].time - sorted[i].time)
      return sorted[i].value + (sorted[i + 1].value - sorted[i].value) * t
    }
  }
  
  return defaultValue
}

// 更新属性（同时更新基础值和关键帧）
function updateProp(prop: string, event: Event) {
  const layer = store.currentLayer
  if (!layer) return
  
  const value = parseFloat((event.target as HTMLInputElement).value)
  if (isNaN(value)) return
  
  const time = store.currentTime
  
  // 如果有关键帧，更新或创建当前时间的关键帧
  if (layer.keyframes && layer.keyframes[prop] && layer.keyframes[prop].length > 0) {
    const kfIndex = layer.keyframes[prop].findIndex((k: any) => Math.abs(k.time - time) < 0.05)
    if (kfIndex >= 0) {
      layer.keyframes[prop][kfIndex] = { time: layer.keyframes[prop][kfIndex].time, value }
    } else {
      // 自动创建关键帧
      layer.keyframes[prop].push({ time, value })
      layer.keyframes[prop].sort((a: any, b: any) => a.time - b.time)
    }
  }
  
  // 使用 store 方法更新以触发响应式
  store.updateLayer(store.currentLayerIndex, { [prop]: value })
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const frames = Math.floor((seconds % 1) * store.project.fps)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`
}

function getKeyframes(layer: any) {
  const result: any[] = []
  if (!layer.keyframes) return result
  const props = ['x', 'y', 'scale', 'rotation', 'opacity', 'mask_size']
  for (const prop of props) {
    const frames = layer.keyframes[prop] || []
    for (const frame of frames) {
      result.push({ id: `${prop}_${frame.time}`, time: frame.time, prop, value: frame.value })
    }
  }
  return result
}

// 获取单个属性的关键帧
function getPropertyKeyframes(layer: any, prop: string) {
  if (!layer.keyframes || !layer.keyframes[prop]) return []
  return layer.keyframes[prop].map((kf: any) => ({ time: kf.time, value: kf.value }))
}

// 格式化数值显示
function formatValue(value: number, prop: string): string {
  if (prop === 'opacity') return (value * 100).toFixed(0) + '%'
  if (prop === 'scale') return value.toFixed(2)
  if (prop === 'rotation') return value.toFixed(0) + '°'
  return value.toFixed(0)
}

// 切换图层展开/折叠
function toggleLayerExpand(layerIdx: number) {
  if (expandedLayers.value.has(layerIdx)) {
    expandedLayers.value.delete(layerIdx)
  } else {
    expandedLayers.value.add(layerIdx)
  }
}

// 时间轴交互 - 从事件获取时间
function getTimeFromRuler(e: MouseEvent): number {
  if (!timelineRef.value) return 0
  const ruler = timelineRef.value.querySelector('.timeline-ruler')
  if (!ruler) return 0
  const rect = ruler.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  return ratio * store.project.duration
}

// 标尺点击/拖拽
function onRulerMouseDown(e: MouseEvent) {
  isDraggingRuler = true
  store.setCurrentTime(getTimeFromRuler(e))
}

function onRulerMouseMove(e: MouseEvent) {
  if (!isDraggingRuler) return
  store.setCurrentTime(getTimeFromRuler(e))
}

function onRulerMouseUp() {
  isDraggingRuler = false
}

// 轨道双击添加关键帧
function onTrackDblClick(e: MouseEvent) {
  if (!store.currentLayer) return
  const time = getTimeFromRuler(e)
  store.setCurrentTime(time)
  store.addKeyframe()
}

// 在指定位置添加关键帧
function addKeyframeAt(e: MouseEvent, layerIdx: number, prop: string) {
  const layer = store.layers[layerIdx]
  if (!layer) return
  
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  const time = ratio * store.project.duration
  
  // 获取当前值
  const value = layer[prop] ?? (prop === 'scale' || prop === 'opacity' ? 1 : 0)
  
  // 添加关键帧
  if (!layer.keyframes) layer.keyframes = {}
  if (!layer.keyframes[prop]) layer.keyframes[prop] = []
  
  // 检查是否已存在
  const existing = layer.keyframes[prop].find((kf: any) => Math.abs(kf.time - time) < 0.05)
  if (!existing) {
    layer.keyframes[prop].push({ time, value })
    layer.keyframes[prop].sort((a: any, b: any) => a.time - b.time)
  }
}

// 选择关键帧
function selectKeyframe(layerIdx: number, prop: string, time: number) {
  selectedKeyframe.value = { layerIdx, prop, time }
  store.selectLayer(layerIdx)
  store.setCurrentTime(time)
}

// 判断关键帧是否选中
function isKeyframeSelected(layerIdx: number, prop: string, time: number): boolean {
  const sel = selectedKeyframe.value
  if (!sel) return false
  return sel.layerIdx === layerIdx && sel.prop === prop && Math.abs(sel.time - time) < 0.01
}

// 关键帧拖拽开始
function onKeyframeDragStart(e: MouseEvent, layerIdx: number, prop: string, kf: any) {
  e.preventDefault()
  isDraggingKeyframe = true
  draggingKeyframeData = { layerIdx, prop, originalTime: kf.time }
  selectKeyframe(layerIdx, prop, kf.time)
  
  // 保存轨道元素引用
  const trackElement = (e.target as HTMLElement).parentElement
  if (!trackElement) return
  
  const onMove = (moveE: MouseEvent) => {
    if (!isDraggingKeyframe || !draggingKeyframeData || !trackElement) return
    
    const rect = trackElement.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (moveE.clientX - rect.left) / rect.width))
    const newTime = ratio * store.project.duration
    
    // 更新关键帧时间
    const layer = store.layers[draggingKeyframeData.layerIdx]
    if (layer?.keyframes?.[draggingKeyframeData.prop]) {
      const kfArr = layer.keyframes[draggingKeyframeData.prop]
      const kfIdx = kfArr.findIndex((k: any) => Math.abs(k.time - draggingKeyframeData!.originalTime) < 0.01)
      if (kfIdx >= 0) {
        kfArr[kfIdx] = { time: newTime, value: kfArr[kfIdx].value }
        draggingKeyframeData.originalTime = newTime
        selectedKeyframe.value = { layerIdx, prop, time: newTime }
        store.setCurrentTime(newTime) // 同步播放头
      }
    }
  }
  
  const onUp = () => {
    isDraggingKeyframe = false
    draggingKeyframeData = null
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// 删除关键帧
function deleteKeyframe(layerIdx: number, prop: string, time: number) {
  const layer = store.layers[layerIdx]
  if (!layer?.keyframes?.[prop]) return
  layer.keyframes[prop] = layer.keyframes[prop].filter((kf: any) => Math.abs(kf.time - time) > 0.01)
  if (selectedKeyframe.value?.layerIdx === layerIdx && 
      selectedKeyframe.value?.prop === prop && 
      Math.abs(selectedKeyframe.value?.time - time) < 0.01) {
    selectedKeyframe.value = null
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
function deleteCurrentKeyframe() { store.deleteKeyframe() }
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

      // 预先创建 Image 对象，保证 Canvas 与 Mask 等功能可以立即使用尺寸信息
      const img = new Image()
      img.onload = () => {
        store.addLayer({
          id: 'uploaded_' + Date.now() + '_' + i,
          name: file.name.replace(/\.[^/.]+$/, ''),
          type: pendingType,
          image_data: data,
          img,
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
      img.src = data
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
/* 根容器 */
.ae-vue-timeline-root {
  width: 100% !important;
  height: 100% !important;
}

/* 主布局 Grid：4 行，画布占大部分 */
.ae-vue-timeline-root .root {
  display: grid !important;
  grid-template-rows: 1fr 44px 36px 180px !important;
  grid-template-columns: 1fr !important;
  width: 100% !important;
  height: 100% !important;
  background: #1a1a1a;
  color: #ddd;
  font-family: -apple-system, sans-serif;
  font-size: 12px;
  box-sizing: border-box;
}

/* 1. 画布区域 */
.ae-vue-timeline-root .canvas-area { 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  background: #111; 
  overflow: hidden; 
}

/* 2. 工具栏 */
.ae-vue-timeline-root .toolbar-area { 
  display: flex; 
  align-items: center; 
  justify-content: center;
  padding: 0 12px; 
  background: #2a2a2a; 
  border-top: 1px solid #444; 
  border-bottom: 1px solid #444; 
}

.ae-vue-timeline-root .toolbar-center {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ae-vue-timeline-root .tb-btn {
  padding: 6px 12px;
  background: #383838;
  border: 1px solid #555;
  border-radius: 4px;
  color: #ccc;
  cursor: pointer;
  font-size: 12px;
  white-space: nowrap;
}
.ae-vue-timeline-root .tb-btn:hover { background: #484848; }
.ae-vue-timeline-root .tb-btn.active { background: #3a7bc8; color: #fff; border-color: #5dade2; }
.ae-vue-timeline-root .tb-btn.accent { background: #2d5a3d; color: #8ff; }
.ae-vue-timeline-root .tb-btn.save { background: #2d5a3d; color: #fff; }
.ae-vue-timeline-root .tb-btn.close { background: #c83a3a; color: #fff; }
.ae-vue-timeline-root .tb-sep { width: 1px; height: 20px; background: #555; }
.ae-vue-timeline-root .tb-spacer { flex: 1; }
.ae-vue-timeline-root .tb-time { color: #888; font-family: monospace; font-size: 11px; }

/* 3. 参数区域 */
.ae-vue-timeline-root .params-area { 
  display: flex; 
  align-items: center; 
  justify-content: center;
  gap: 16px; 
  padding: 0 12px; 
  background: #252525; 
  border-bottom: 1px solid #333; 
}

.ae-vue-timeline-root .param-label { font-weight: 600; color: #fff; margin-right: 8px; }
.ae-vue-timeline-root .param-empty { color: #666; font-size: 11px; }

.ae-vue-timeline-root .param-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.ae-vue-timeline-root .param-group label {
  color: #888;
  font-size: 10px;
  min-width: 40px;
}
.ae-vue-timeline-root .param-input {
  width: 60px;
  padding: 3px 6px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 3px;
  color: #fff;
  font-size: 11px;
  font-family: monospace;
}
.ae-vue-timeline-root .param-input:focus {
  border-color: #3a7bc8;
  outline: none;
}
.ae-vue-timeline-root .param-slider {
  width: 60px;
  height: 4px;
  cursor: pointer;
}
.ae-vue-timeline-root .param-value {
  color: #aaa;
  font-size: 10px;
  font-family: monospace;
  min-width: 35px;
}

/* 4. 底部区域（图层 + 时间轴）*/
.ae-vue-timeline-root .bottom-area { 
  display: flex; 
  background: #1e1e1e; 
}

/* 图层侧边栏 */
.ae-vue-timeline-root .layers-sidebar { 
  width: 220px; 
  min-width: 220px;
  border-right: 1px solid #333; 
  display: flex; 
  flex-direction: column; 
}

.ae-vue-timeline-root .layers-header { 
  height: 32px; 
  padding: 0 12px; 
  background: #252525; 
  border-bottom: 1px solid #333; 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  color: #fff; 
  font-size: 11px; 
  font-weight: 600; 
}

.ae-vue-timeline-root .layer-actions { display: flex; gap: 4px; }

.ae-vue-timeline-root .layer-btn { 
  padding: 2px 6px; 
  background: #383838; 
  border: 1px solid #555; 
  border-radius: 3px; 
  color: #aaa; 
  cursor: pointer; 
  font-size: 10px; 
}
.ae-vue-timeline-root .layer-btn:hover { background: #484848; }
.ae-vue-timeline-root .layer-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.ae-vue-timeline-root .layers-list { flex: 1; overflow-y: auto; }

.ae-vue-timeline-root .layer-item { 
  display: flex; 
  align-items: center; 
  gap: 8px; 
  height: 32px; 
  padding: 0 12px; 
  border-bottom: 1px solid #2a2a2a; 
  cursor: pointer; 
}
.ae-vue-timeline-root .layer-item:hover { background: #2a2a2a; }
.ae-vue-timeline-root .layer-item.active { background: #3a5070; }

.ae-vue-timeline-root .layer-badge { 
  padding: 2px 6px; 
  background: #444; 
  border-radius: 3px; 
  color: #aaa; 
  font-size: 9px; 
  font-weight: 600; 
}
.ae-vue-timeline-root .layer-badge.background { background: #2d5a3d; color: #8ff; }
.ae-vue-timeline-root .layer-badge.foreground { background: #3a5070; color: #9cf; }

.ae-vue-timeline-root .layer-name { 
  flex: 1; 
  overflow: hidden; 
  text-overflow: ellipsis; 
  white-space: nowrap; 
  font-size: 11px; 
}

.ae-vue-timeline-root .layer-del { 
  opacity: 0; 
  background: none; 
  border: none; 
  color: #888; 
  cursor: pointer; 
  font-size: 16px; 
}
.ae-vue-timeline-root .layer-item:hover .layer-del { opacity: 1; }
.ae-vue-timeline-root .layer-del:hover { color: #f44; }

/* 时间轴区域 */
.ae-vue-timeline-root .timeline-area { 
  flex: 1; 
  position: relative; 
  display: flex; 
  flex-direction: column;
  overflow: hidden;
}

/* 时间标尺 */
.ae-vue-timeline-root .timeline-ruler { 
  height: 28px; 
  min-height: 28px;
  background: #1a1a1a; 
  border-bottom: 1px solid #444; 
  position: relative;
  cursor: pointer;
  margin-left: 60px; /* 与 prop-name 宽度对齐 */
}

.ae-vue-timeline-root .timeline-ruler .tick { 
  position: absolute; 
  top: 0; 
  height: 100%; 
  border-left: 1px solid #444; 
  padding-left: 4px; 
  font-size: 10px; 
  color: #666; 
  display: flex; 
  align-items: center;
  user-select: none;
}

.ae-vue-timeline-root .playhead-top {
  position: absolute;
  top: 0;
  width: 12px;
  height: 12px;
  background: #e74c3c;
  transform: translateX(-50%);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
  z-index: 5;
}

/* 轨道容器 */
.ae-vue-timeline-root .timeline-tracks { 
  flex: 1; 
  position: relative; 
  overflow-y: auto;
  overflow-x: hidden;
}

/* 图层标题行 */
.ae-vue-timeline-root .track-header {
  height: 24px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  background: #252525;
  border-bottom: 1px solid #333;
  cursor: pointer;
  user-select: none;
}
.ae-vue-timeline-root .track-header:hover { background: #2a2a2a; }
.ae-vue-timeline-root .track-header.active { background: #2d3a4d; }
.ae-vue-timeline-root .track-header.expanded { background: #2a2a2a; }

.ae-vue-timeline-root .track-expand {
  width: 16px;
  height: 16px;
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 8px;
  padding: 0;
}
.ae-vue-timeline-root .track-expand:hover { color: #fff; }

.ae-vue-timeline-root .track-name {
  font-size: 11px;
  color: #ccc;
}

/* 属性行 */
.ae-vue-timeline-root .track-prop {
  height: 22px;
  display: flex;
  align-items: center;
  background: #1e1e1e;
  border-bottom: 1px solid #2a2a2a;
}
.ae-vue-timeline-root .track-prop:hover { background: #222; }
.ae-vue-timeline-root .track-prop.active { background: #1e2a38; }

.ae-vue-timeline-root .prop-name {
  width: 60px;
  min-width: 60px;
  padding-left: 24px;
  font-size: 10px;
  color: #888;
  user-select: none;
}

.ae-vue-timeline-root .prop-track {
  flex: 1;
  height: 100%;
  position: relative;
  cursor: crosshair;
}

/* 关键帧 */
.ae-vue-timeline-root .keyframe { 
  position: absolute; 
  top: 50%; 
  transform: translate(-50%, -50%) rotate(45deg); 
  width: 8px; 
  height: 8px; 
  background: #3498db; 
  border: 1px solid #5dade2; 
  cursor: grab;
  transition: transform 0.1s, background 0.1s;
}
.ae-vue-timeline-root .keyframe:hover { 
  transform: translate(-50%, -50%) rotate(45deg) scale(1.3); 
  background: #5dade2; 
}
.ae-vue-timeline-root .keyframe.selected {
  background: #f1c40f;
  border-color: #f39c12;
  box-shadow: 0 0 6px #f1c40f;
}
.ae-vue-timeline-root .keyframe:active {
  cursor: grabbing;
}

/* 播放头 */
.ae-vue-timeline-root .timeline-area .playhead { 
  position: absolute; 
  top: 28px; 
  bottom: 0; 
  width: 2px; 
  background: #e74c3c; 
  z-index: 10; 
  pointer-events: none;
  margin-left: 60px; /* 与 prop-name 宽度对齐 */
  transform: translateX(-1px);
}
.ae-vue-timeline-root .playhead::before {
  content: '';
  position: absolute;
  top: -28px;
  left: -5px;
  width: 12px;
  height: 28px;
  background: linear-gradient(to bottom, #e74c3c 0%, #e74c3c 50%, transparent 50%);
}

/* Canvas Preview */
.ae-vue-timeline-root .canvas-preview { 
  width: 100%; 
  height: 100%; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
}
.ae-vue-timeline-root .canvas-preview canvas { 
  box-shadow: 0 4px 24px rgba(0,0,0,0.5); 
  cursor: move; 
  max-width: 100%; 
  max-height: 100%; 
}
</style>
