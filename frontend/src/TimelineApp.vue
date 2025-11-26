<template>
  <div class="root">
    <!-- 1. 画布区域 -->
    <div class="canvas-area">
      <CanvasPreview ref="canvasPreviewRef" />
    </div>
    
    <!-- 2. 功能按钮与工程管理 -->
    <div class="toolbar-area">
      <div class="toolbar-left">
        <button class="tb-btn accent" @click="exportProject" title="保存工程文件 (.json)">💾 Save Proj</button>
        <button class="tb-btn" @click="triggerLoadProject" title="加载工程文件">📂 Load Proj</button>
      </div>
      
      <div class="toolbar-center">
        <button class="tb-btn" @click="addForeground" title="添加前景图层">+ Layer</button>
        <button class="tb-btn" @click="addBackground" title="添加背景图层">+ BG</button>
        <span class="tb-sep"></span>
        <button class="tb-btn" @click="seekToZero" title="回到起点">|◀</button>
        <button class="tb-btn" :class="{active: store.isPlaying}" @click="store.togglePlayback" title="播放/暂停">
          {{ store.isPlaying ? '■' : '▶' }}
        </button>
        <span class="tb-sep"></span>
        <button class="tb-btn accent" @click="addKeyframe" title="添加关键帧 (K)">◆ Key</button>
        <button class="tb-btn" @click="deleteCurrentKeyframe" title="删除关键帧">✕ Key</button>
        <span class="tb-sep"></span>
        <!-- 工具栏 -->
        <button class="tb-btn" :class="{active: store.maskMode.enabled}" @click="toggleMask" title="遮罩绘制模式">🖌 Mask</button>
        <button 
          v-if="store.maskMode.enabled" 
          class="tb-btn" 
          :class="{active: store.maskMode.erase}" 
          @click="store.maskMode.erase = !store.maskMode.erase" 
          title="切换橡皮擦/还原"
        >
          🧽 Erase
        </button>
        <button class="tb-btn" :class="{active: store.pathMode.enabled}" @click="togglePath" title="路径动画模式">📍 Path</button>
        <button class="tb-btn" :class="{active: store.extractMode.enabled}" @click="toggleExtract" title="背景提取模式">✂ Extract</button>
        
        <!-- Extract 操作组 -->
        <div v-if="store.extractMode.enabled" class="extract-actions">
          <button class="tb-btn accent" @click="applyExtract" title="应用提取结果并生成前景图层">✓ Apply</button>
          <button class="tb-btn" @click="clearExtractSelection" title="清空提取选区">⟲ Clear</button>
        </div>

        <span class="tb-sep"></span>
        <span class="tb-time">{{ formatTime(store.currentTime) }}</span>
        <button class="tb-btn save" @click="save">保存到节点</button>
        <button class="tb-btn close" @click="close">✕</button>
      </div>
    </div>
    
    <!-- 3. 参数调整区域 -->
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
        
        <!-- Mask 画笔设置 (新增) -->
        <template v-if="store.maskMode.enabled">
          <div class="param-sep"></div>
          <div class="param-group">
            <label>Mask Brush</label>
            <input type="range" v-model.number="store.maskMode.brush" min="1" max="100" step="1" class="param-slider" />
            <span class="param-value">{{ store.maskMode.brush }}px</span>
          </div>
        </template>

        <!-- Extract 设置 -->
        <template v-if="store.extractMode.enabled">
          <div class="param-sep"></div>
          <div class="param-group">
            <label>Extract Brush</label>
            <input type="range" v-model.number="store.extractMode.brush" min="5" max="150" step="1" class="param-slider" />
            <span class="param-value">{{ store.extractMode.brush }}px</span>
          </div>
        </template>
      </template>
      <template v-else>
        <span class="param-empty">请选择一个图层进行编辑</span>
      </template>
    </div>
    
    <!-- 4. 底部：图层 + 时间轴 (重构：像素定位系统) -->
    <div class="bottom-area">
      <!-- 左侧：图层列表 -->
      <div class="layers-sidebar">
        <div class="layers-header">
          <span>Layers ({{ store.layers.length }})</span>
          <div class="layer-actions">
            <button class="layer-btn" @click="moveUp" :disabled="!store.currentLayer" title="上移">▲</button>
            <button class="layer-btn" @click="moveDown" :disabled="!store.currentLayer" title="下移">▼</button>
          </div>
        </div>
        <div class="layers-list" @scroll="onLayersScroll">
          <div v-for="(layer, i) in store.layers" :key="layer.id" 
               class="layer-item" 
               :class="{active: i === store.currentLayerIndex}"
               @click="store.selectLayer(i)">
            <span class="layer-vis" @click.stop="toggleVis(layer)">👁</span>
            <span class="layer-badge" :class="layer.type">{{ layer.type === 'background' ? 'BG' : 'FG' }}</span>
            <span class="layer-name">{{ layer.name || ('Layer ' + (i + 1)) }}</span>
            <button class="layer-del" @click.stop="store.removeLayer(i)">🗑</button>
          </div>
        </div>
      </div>
      
      <!-- 右侧：时间轴 (Scrollable Container) -->
      <div class="timeline-area" ref="timelineRef">
        <div class="timeline-content" :style="{ width: timelineWidth + 'px' }">
          <!-- 时间标尺 -->
          <div class="timeline-ruler" 
               @mousedown="onRulerMouseDown" 
               @mousemove="onRulerMouseMove" 
               @mouseup="onRulerMouseUp"
               @mouseleave="onRulerMouseUp">
            <div v-for="i in Math.ceil(store.project.duration) + 1" :key="i" 
                 class="tick" 
                 :style="{ left: ((i-1) * PIXELS_PER_SECOND) + 'px' }">
              <span class="tick-label">{{ i-1 }}s</span>
            </div>
            <!-- 播放头 -->
            <div class="playhead-top" :style="{ left: (store.currentTime * PIXELS_PER_SECOND) + 'px' }"></div>
          </div>
          
          <!-- 轨道列表 -->
          <div class="timeline-tracks" @dblclick="onTrackDblClick" @scroll="onTracksScroll">
            <template v-for="(layer, layerIdx) in store.layers" :key="layer.id">
              <!-- 图层行 -->
              <div class="track-header" 
                   :class="{active: layerIdx === store.currentLayerIndex, expanded: expandedLayers.has(layerIdx)}"
                   @click="store.selectLayer(layerIdx)">
                <button class="track-expand" @click.stop="toggleLayerExpand(layerIdx)">
                  {{ expandedLayers.has(layerIdx) ? '▼' : '▶' }}
                </button>
                <span class="track-bar" :style="{ width: (store.project.duration * PIXELS_PER_SECOND) + 'px' }"></span>
              </div>
              
              <!-- 属性展开行 -->
              <template v-if="expandedLayers.has(layerIdx)">
                <div v-for="prop in animatableProps" :key="prop.key" 
                     class="track-prop"
                     :class="{active: layerIdx === store.currentLayerIndex}"
                     @click="store.selectLayer(layerIdx)">
                  <div class="prop-track" 
                       @dblclick.stop="addKeyframeAt($event, layerIdx, prop.key)">
                    <!-- 关键帧 (Pixel Position) -->
                    <div v-for="kf in getPropertyKeyframes(layer, prop.key)" :key="kf.time"
                         class="keyframe"
                         :class="{selected: isKeyframeSelected(layerIdx, prop.key, kf.time)}"
                         :style="{ left: (kf.time * PIXELS_PER_SECOND) + 'px' }"
                         :title="`${prop.label}: ${formatValue(kf.value, prop.key)} @ ${kf.time.toFixed(2)}s`"
                         @mousedown.stop="onKeyframeDragStart($event, layerIdx, prop.key, kf)"
                         @click.stop="selectKeyframe(layerIdx, prop.key, kf.time)"
                         @contextmenu.prevent="deleteKeyframe(layerIdx, prop.key, kf.time)">
                    </div>
                  </div>
                </div>
              </template>
            </template>
          </div>
          
          <!-- 全局播放头线 -->
          <div class="playhead-line" :style="{ left: (store.currentTime * PIXELS_PER_SECOND) + 'px' }"></div>
        </div>
      </div>
    </div>
    
    <!-- 隐形文件输入 -->
    <input ref="fileInput" type="file" accept="image/*" multiple style="display:none" @change="onFile" />
    <input ref="projectInput" type="file" accept=".json" style="display:none" @change="onLoadProject" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useTimelineStore } from '@/stores/timelineStore'
import CanvasPreview from '@/components/timeline/CanvasPreview.vue'

const PIXELS_PER_SECOND = 60 // 1秒 = 60像素 (更精确的控制)

const props = defineProps<{ node: any }>()
const store = useTimelineStore()
const canvasPreviewRef = ref<InstanceType<typeof CanvasPreview> | null>(null)
const fileInput = ref<HTMLInputElement>()
const projectInput = ref<HTMLInputElement>()
const timelineRef = ref<HTMLDivElement>()
let pendingType: 'foreground' | 'background' = 'foreground'
let isDraggingRuler = false

// 计算总宽度，确保滚动
const timelineWidth = computed(() => {
  return Math.max(
    store.project.duration * PIXELS_PER_SECOND + 100, // 额外留白
    timelineRef.value?.clientWidth || 0
  )
})

watch(() => store.extractMode.enabled, (enabled) => {
  if (!enabled) {
    canvasPreviewRef.value?.clearExtractSelection?.()
  }
})
let isDraggingKeyframe = false
let draggingKeyframeData: { layerIdx: number, prop: string, originalTime: number } | null = null

const expandedLayers = ref<Set<number>>(new Set([0]))
const selectedKeyframe = ref<{ layerIdx: number, prop: string, time: number } | null>(null)

const animatableProps = [
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'scale', label: 'Scl' },
  { key: 'rotation', label: 'Rot' },
  { key: 'opacity', label: 'Op' }
]

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

function updateProp(prop: string, event: Event) {
  const layer = store.currentLayer
  if (!layer) return
  const value = parseFloat((event.target as HTMLInputElement).value)
  if (isNaN(value)) return
  const time = store.currentTime
  if (layer.keyframes && layer.keyframes[prop] && layer.keyframes[prop].length > 0) {
    const kfIndex = layer.keyframes[prop].findIndex((k: any) => Math.abs(k.time - time) < 0.05)
    if (kfIndex >= 0) {
      layer.keyframes[prop][kfIndex] = { time: layer.keyframes[prop][kfIndex].time, value }
    } else {
      layer.keyframes[prop].push({ time, value })
      layer.keyframes[prop].sort((a: any, b: any) => a.time - b.time)
    }
  }
  store.updateLayer(store.currentLayerIndex, { [prop]: value })
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const frames = Math.floor((seconds % 1) * store.project.fps)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`
}

function getPropertyKeyframes(layer: any, prop: string) {
  if (!layer.keyframes || !layer.keyframes[prop]) return []
  return layer.keyframes[prop].map((kf: any) => ({ time: kf.time, value: kf.value }))
}

function formatValue(value: number, prop: string): string {
  if (prop === 'opacity') return (value * 100).toFixed(0) + '%'
  return value.toFixed(1)
}

function toggleLayerExpand(layerIdx: number) {
  if (expandedLayers.value.has(layerIdx)) {
    expandedLayers.value.delete(layerIdx)
  } else {
    expandedLayers.value.add(layerIdx)
  }
}

function toggleVis(layer: any) {
  // 暂未实现图层可见性逻辑，预留
  console.log('Toggle vis', layer.id)
}

// --- 时间轴交互 (Pixel Based) ---
function getTimeFromEvent(e: MouseEvent): number {
  if (!timelineRef.value) return 0
  const content = timelineRef.value.querySelector('.timeline-content')
  if (!content) return 0
  
  const rect = content.getBoundingClientRect()
  const scrollLeft = timelineRef.value.scrollLeft
  const clickX = e.clientX - rect.left // 相对于内容左侧的距离
  
  const time = Math.max(0, clickX / PIXELS_PER_SECOND)
  return Math.min(time, store.project.duration)
}

function onRulerMouseDown(e: MouseEvent) {
  isDraggingRuler = true
  store.setCurrentTime(getTimeFromEvent(e))
}

function onRulerMouseMove(e: MouseEvent) {
  if (!isDraggingRuler) return
  store.setCurrentTime(getTimeFromEvent(e))
}

function onRulerMouseUp() {
  isDraggingRuler = false
}

function onTrackDblClick(e: MouseEvent) {
  if (!store.currentLayer) return
  const time = getTimeFromEvent(e)
  store.setCurrentTime(time)
  store.addKeyframe()
}

function addKeyframeAt(e: MouseEvent, layerIdx: number, prop: string) {
  // 实现双击轨道添加关键帧逻辑
  // 注意：需要计算相对于 prop-track 的位置
  const target = e.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const localX = e.clientX - rect.left
  const time = Math.max(0, localX / PIXELS_PER_SECOND)
  
  const layer = store.layers[layerIdx]
  if (!layer) return
  
  const value = layer[prop] ?? (prop === 'scale' || prop === 'opacity' ? 1 : 0)
  if (!layer.keyframes) layer.keyframes = {}
  if (!layer.keyframes[prop]) layer.keyframes[prop] = []
  
  const existing = layer.keyframes[prop].find((kf: any) => Math.abs(kf.time - time) < 0.05)
  if (!existing) {
    layer.keyframes[prop].push({ time, value })
    layer.keyframes[prop].sort((a: any, b: any) => a.time - b.time)
  }
}

function selectKeyframe(layerIdx: number, prop: string, time: number) {
  selectedKeyframe.value = { layerIdx, prop, time }
  store.selectLayer(layerIdx)
  store.setCurrentTime(time)
}

function isKeyframeSelected(layerIdx: number, prop: string, time: number): boolean {
  const sel = selectedKeyframe.value
  if (!sel) return false
  return sel.layerIdx === layerIdx && sel.prop === prop && Math.abs(sel.time - time) < 0.01
}

function onKeyframeDragStart(e: MouseEvent, layerIdx: number, prop: string, kf: any) {
  e.preventDefault()
  isDraggingKeyframe = true
  draggingKeyframeData = { layerIdx, prop, originalTime: kf.time }
  selectKeyframe(layerIdx, prop, kf.time)
  
  const startX = e.clientX
  const startTime = kf.time
  
  const onMove = (moveE: MouseEvent) => {
    if (!isDraggingKeyframe || !draggingKeyframeData) return
    
    const diffX = moveE.clientX - startX
    const diffTime = diffX / PIXELS_PER_SECOND
    let newTime = Math.max(0, startTime + diffTime)
    
    // 更新
    const layer = store.layers[draggingKeyframeData.layerIdx]
    if (layer?.keyframes?.[draggingKeyframeData.prop]) {
      const kfArr = layer.keyframes[draggingKeyframeData.prop]
      const kfIdx = kfArr.findIndex((k: any) => Math.abs(k.time - draggingKeyframeData!.originalTime) < 0.01)
      if (kfIdx >= 0) {
        kfArr[kfIdx].time = newTime
        draggingKeyframeData.originalTime = newTime
        selectedKeyframe.value!.time = newTime
        store.setCurrentTime(newTime)
      }
    }
  }
  
  const onUp = () => {
    isDraggingKeyframe = false
    draggingKeyframeData = null
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    // 排序
    const layer = store.layers[layerIdx]
    if (layer?.keyframes?.[prop]) {
        layer.keyframes[prop].sort((a: any, b: any) => a.time - b.time)
    }
  }
  
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

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


// --- 滚动同步逻辑 ---
function onLayersScroll(e: Event) {
  if (timelineRef.value) {
    const target = e.target as HTMLElement
    const tracks = timelineRef.value.querySelector('.timeline-tracks') as HTMLElement
    if (tracks) tracks.scrollTop = target.scrollTop
  }
}

function onTracksScroll(e: Event) {
  // 仅用于水平滚动同步 (如果 ruler 分离)
  // 但此处主要处理垂直同步
  const target = e.target as HTMLElement
  const sidebar = document.querySelector('.layers-list') as HTMLElement
  if (sidebar) sidebar.scrollTop = target.scrollTop
}

// --- 工程管理 (Export/Import) ---
function exportProject() {
  const data = store.exportAnimation()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ae_project_${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function triggerLoadProject() {
  projectInput.value?.click()
}

function onLoadProject(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const json = JSON.parse(ev.target?.result as string)
      store.loadAnimation(json)
      console.log('Project loaded successfully')
    } catch (err) {
      console.error('Failed to parse project file', err)
      alert('工程文件损坏或格式错误')
    }
  }
  reader.readAsText(file)
  if (projectInput.value) projectInput.value.value = ''
}

function save() {
  if (!props.node?.widgets) {
    console.error('[AE Timeline] Node or widgets not found!')
    return
  }
  const findWidget = (n: string) => props.node.widgets.find((x: any) => x.name === n)
  
  console.log('[AE Timeline] Saving...')
  
  // 序列化 Mask 数据
  store.layers.forEach(layer => {
    if (layer.maskCanvas) {
      layer.customMask = layer.maskCanvas.toDataURL()
      console.log(`[AE Timeline] Layer ${layer.id}: Saved mask (len=${layer.customMask.length})`)
    }
  })

  const anim = store.exportAnimation()
  
  // Debug Path
  anim.layers.forEach((l, i) => {
      if (l.bezierPath && l.bezierPath.length > 0) {
          console.log(`[AE Timeline] Layer ${l.id}: Exporting Path with ${l.bezierPath.length} points`)
      }
  })

  const lw = findWidget('layers_keyframes')
  if (lw) {
      const jsonStr = JSON.stringify(anim.layers)
      lw.value = jsonStr
      console.log(`[AE Timeline] Saved layers_keyframes (len=${jsonStr.length})`)
  } else {
      console.error('[AE Timeline] Widget layers_keyframes not found!')
  }
  
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
function seekToZero() { store.setCurrentTime(0) }

function toggleMask() {
  const next = !store.maskMode.enabled
  store.maskMode.enabled = next
  if (next) {
    store.pathMode.enabled = false
    if (store.extractMode.enabled) {
      store.extractMode.enabled = false
      canvasPreviewRef.value?.clearExtractSelection?.()
    }
  }
}

function togglePath() {
  const next = !store.pathMode.enabled
  store.pathMode.enabled = next
  if (next) {
    store.maskMode.enabled = false
    if (store.extractMode.enabled) {
      store.extractMode.enabled = false
      canvasPreviewRef.value?.clearExtractSelection?.()
    }
  }
}

function toggleExtract() {
  const next = !store.extractMode.enabled
  if (next) {
    const bgLayer = store.layers.find(l => l.type === 'background')
    if (!bgLayer) {
      alert('请先添加背景图层再使用提取功能')
      return
    }
    store.maskMode.enabled = false
    store.pathMode.enabled = false
  } else {
    canvasPreviewRef.value?.clearExtractSelection?.()
  }
  store.extractMode.enabled = next
}

function clearExtractSelection() {
  canvasPreviewRef.value?.clearExtractSelection?.()
}

function applyExtract() {
  const preview = canvasPreviewRef.value
  if (!preview || typeof preview.applyExtractSelection !== 'function') return
  const result = preview.applyExtractSelection()
  if (!result) {
    alert('请先绘制提取选区')
    return
  }
  if ('error' in result) {
    alert(result.error)
    return
  }

  // 1. 创建前景图层
  const fgImg = new Image()
  fgImg.onload = () => {
    const extractedCount = store.layers.filter(l => l.id?.startsWith('extracted_')).length
    store.addLayer({
      id: `extracted_${Date.now()}`,
      name: `Extract ${extractedCount + 1}`,
      type: 'foreground',
      image_data: result.foregroundDataUrl,
      img: fgImg,
      x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, mask_size: 0, keyframes: {}
    })
  }
  fgImg.src = result.foregroundDataUrl

  // 2. 更新背景图层 (填充后的)
  const bgLayer = store.layers.find(l => l.type === 'background')
  if (bgLayer && result.backgroundDataUrl) {
    const bgImg = new Image()
    bgImg.onload = () => {
        bgLayer.image_data = result.backgroundDataUrl
        bgLayer.img = bgImg
        // 强制刷新
        store.updateLayer(store.layers.indexOf(bgLayer), { image_data: result.backgroundDataUrl })
    }
    bgImg.src = result.backgroundDataUrl
  }

  store.extractMode.enabled = false
  canvasPreviewRef.value?.clearExtractSelection?.()
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
      const img = new Image()
      img.onload = () => {
        store.addLayer({
          id: 'uploaded_' + Date.now() + '_' + i,
          name: file.name.replace(/\.[^/.]+$/, ''),
          type: pendingType,
          image_data: data,
          img,
          x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, mask_size: 0, keyframes: {}, bg_mode: 'fit'
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
</script>

<style>
/* 根容器 */
.ae-vue-timeline-root {
  width: 100% !important;
  height: 100% !important;
}

/* 主布局 Grid：4 行 */
.ae-vue-timeline-root .root {
  display: grid !important;
  grid-template-rows: 1fr 44px 36px 200px !important; /* 底部增高 */
  grid-template-columns: 1fr !important;
  width: 100% !important;
  height: 100% !important;
  background: #1a1a1a;
  color: #ddd;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
  box-sizing: border-box;
}

/* 1. 画布区域 */
.ae-vue-timeline-root .canvas-area { 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  background: #0f0f0f; 
  overflow: hidden; 
  border-bottom: 1px solid #333;
}

/* 2. 工具栏 */
.ae-vue-timeline-root .toolbar-area { 
  display: flex; 
  align-items: center; 
  justify-content: space-between; /* 两端对齐 */
  padding: 0 12px; 
  background: #252525; 
  border-bottom: 1px solid #000; 
}

.ae-vue-timeline-root .toolbar-left,
.ae-vue-timeline-root .toolbar-center {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ae-vue-timeline-root .extract-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  background: rgba(0, 188, 212, 0.1);
  border-radius: 4px;
  border: 1px solid rgba(0, 188, 212, 0.3);
}

.ae-vue-timeline-root .tb-btn {
  padding: 5px 10px;
  background: #383838;
  border: 1px solid #4a4a4a;
  border-radius: 3px;
  color: #ccc;
  cursor: pointer;
  font-size: 11px;
  white-space: nowrap;
  transition: all 0.1s;
}
.ae-vue-timeline-root .tb-btn:hover { background: #484848; color: #fff; }
.ae-vue-timeline-root .tb-btn:active { transform: translateY(1px); }
.ae-vue-timeline-root .tb-btn.active { background: #3a7bc8; color: #fff; border-color: #5dade2; }
.ae-vue-timeline-root .tb-btn.accent { background: #2d5a3d; color: #fff; border-color: #4caf50; }
.ae-vue-timeline-root .tb-btn.close { background: #c83a3a; color: #fff; border-color: #e57373; }
.ae-vue-timeline-root .tb-sep { width: 1px; height: 18px; background: #444; margin: 0 4px; }
.ae-vue-timeline-root .tb-time { color: #3a7bc8; font-family: "Consolas", monospace; font-size: 12px; font-weight: bold; min-width: 60px; text-align: center; }

/* 3. 参数区域 */
.ae-vue-timeline-root .params-area { 
  display: flex; 
  align-items: center; 
  justify-content: flex-start;
  gap: 12px; 
  padding: 0 16px; 
  background: #1f1f1f; 
  border-bottom: 1px solid #000; 
}

.ae-vue-timeline-root .param-label { font-weight: bold; color: #ddd; margin-right: 8px; font-size: 11px; }
.ae-vue-timeline-root .param-sep { width: 1px; height: 16px; background: #444; }
.ae-vue-timeline-root .param-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.ae-vue-timeline-root .param-group label { color: #888; font-size: 10px; }
.ae-vue-timeline-root .param-input {
  width: 50px;
  padding: 2px 4px;
  background: #111;
  border: 1px solid #444;
  border-radius: 2px;
  color: #fff;
  font-size: 11px;
  font-family: monospace;
}
.ae-vue-timeline-root .param-input:focus { border-color: #3a7bc8; outline: none; }
.ae-vue-timeline-root .param-slider { width: 70px; height: 4px; cursor: pointer; }
.ae-vue-timeline-root .param-value { color: #aaa; font-size: 10px; font-family: monospace; min-width: 30px; }

/* 4. 底部区域 */
.ae-vue-timeline-root .bottom-area { 
  display: flex; 
  background: #1e1e1e; 
  overflow: hidden;
}

/* 图层列表 */
.ae-vue-timeline-root .layers-sidebar { 
  width: 240px; 
  min-width: 240px;
  border-right: 1px solid #000; 
  display: flex; 
  flex-direction: column; 
  background: #222;
}

.ae-vue-timeline-root .layers-header { 
  height: 28px; 
  padding: 0 8px; 
  background: #2a2a2a; 
  border-bottom: 1px solid #000; 
  display: flex; 
  align-items: center; 
  justify-content: space-between; 
  color: #ccc; 
  font-size: 11px; 
}

.ae-vue-timeline-root .layers-list { flex: 1; overflow-y: auto; }

.ae-vue-timeline-root .layer-item { 
  display: flex; 
  align-items: center; 
  gap: 6px; 
  height: 28px; /* 增加高度 */
  padding: 0 8px; 
  border-bottom: 1px solid #2a2a2a; 
  cursor: pointer; 
  transition: background 0.1s;
  user-select: none;
}
.ae-vue-timeline-root .layer-item:hover { background: #2d2d2d; }
.ae-vue-timeline-root .layer-item.active { 
  background: #3a5070; 
  border-left: 3px solid #5dade2;
  padding-left: 5px; /* 补偿 border 宽度 */
}

.ae-vue-timeline-root .layer-vis { color: #666; cursor: pointer; font-size: 10px; }
.ae-vue-timeline-root .layer-vis:hover { color: #ddd; }
.ae-vue-timeline-root .layer-badge { 
  padding: 1px 4px; 
  border-radius: 2px; 
  color: #111; 
  font-size: 9px; 
  font-weight: bold; 
}
.ae-vue-timeline-root .layer-badge.background { background: #4db6ac; }
.ae-vue-timeline-root .layer-badge.foreground { background: #64b5f6; }
.ae-vue-timeline-root .layer-name { flex: 1; color: #ccc; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ae-vue-timeline-root .layer-del { 
  background: none; border: none; color: #666; cursor: pointer; font-size: 12px; opacity: 0.5; 
}
.ae-vue-timeline-root .layer-del:hover { color: #ff5252; opacity: 1; }

/* 时间轴右侧 */
.ae-vue-timeline-root .timeline-area { 
  flex: 1; 
  position: relative; 
  overflow-x: auto; /* 横向滚动 */
  overflow-y: hidden;
  background: #1a1a1a;
}

.ae-vue-timeline-root .timeline-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.ae-vue-timeline-root .timeline-ruler { 
  height: 28px; 
  min-height: 28px;
  background: #222; 
  border-bottom: 1px solid #000; 
  position: relative;
  cursor: pointer;
}

.ae-vue-timeline-root .timeline-ruler .tick { 
  position: absolute; 
  top: 0; 
  bottom: 0; 
  border-left: 1px solid #444; 
  padding-left: 2px; 
  pointer-events: none;
}
.ae-vue-timeline-root .tick-label { font-size: 9px; color: #666; }

.ae-vue-timeline-root .playhead-top {
  position: absolute;
  top: 0;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 10px solid #ff5252;
  transform: translateX(-6px);
  z-index: 10;
  pointer-events: none;
}

.ae-vue-timeline-root .timeline-tracks { 
  flex: 1; 
  position: relative; 
  overflow-y: auto; 
}

.ae-vue-timeline-root .track-header {
  height: 24px;
  display: flex;
  align-items: center;
  background: #252525;
  border-bottom: 1px solid #333;
  position: relative;
}
.ae-vue-timeline-root .track-bar { 
  height: 100%; 
  background: repeating-linear-gradient(90deg, transparent 0, transparent 59px, #2a2a2a 60px); 
  opacity: 0.3;
  position: absolute;
  pointer-events: none;
}

.ae-vue-timeline-root .track-prop {
  height: 20px;
  background: #1c1c1c;
  border-bottom: 1px solid #222;
  position: relative;
}

.ae-vue-timeline-root .prop-track {
  width: 100%;
  height: 100%;
  position: relative;
  cursor: crosshair;
}

/* 关键帧点 */
.ae-vue-timeline-root .keyframe { 
  position: absolute; 
  top: 50%; 
  width: 8px; 
  height: 8px; 
  background: #bbb; 
  transform: translate(-4px, -4px) rotate(45deg); 
  border: 1px solid #000; 
  cursor: grab;
  z-index: 2;
}
.ae-vue-timeline-root .keyframe:hover { background: #fff; transform: translate(-4px, -4px) rotate(45deg) scale(1.2); }
.ae-vue-timeline-root .keyframe.selected { background: #ffcc00; border-color: #ff9900; }

/* 全局播放线 */
.ae-vue-timeline-root .playhead-line {
  position: absolute;
  top: 28px; /* ruler height */
  bottom: 0;
  width: 1px;
  background: #ff5252;
  pointer-events: none;
  z-index: 5;
}
</style>
