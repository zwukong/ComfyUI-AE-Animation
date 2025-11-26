<template>
  <div class="ae-timeline">
    <!-- 左侧图层面板 -->
    <div class="layers-panel">
      <!-- 列头 -->
      <div class="layers-header">
        <span class="col-vis">👁</span>
        <span class="col-name">图层名称</span>
      </div>
      <!-- 图层列表 -->
      <div class="layers-list">
        <div class="empty-msg" v-if="store.layers.length === 0">
          暂无图层
        </div>
        <div 
          v-for="(layer, index) in store.layers"
          :key="layer.id"
          class="layer-row"
          :class="{ active: index === store.currentLayerIndex }"
          @click="store.selectLayer(index)"
        >
          <span class="layer-vis">{{ layer.opacity > 0 ? '👁' : '◯' }}</span>
          <span class="layer-icon">{{ layer.type === 'background' ? '🖼' : '📄' }}</span>
          <span class="layer-name">{{ layer.name || '未命名' }}</span>
          <button class="layer-del" @click.stop="store.removeLayer(index)" title="删除">✕</button>
        </div>
      </div>
    </div>

    <!-- 右侧时间轴区 -->
    <div class="timeline-panel" ref="timelinePanel">
      <!-- 时间刻度尺 -->
      <div class="time-ruler" @click="onRulerClick">
        <div 
          v-for="i in tickCount"
          :key="i"
          class="tick"
          :style="{ left: `${((i - 1) / store.project.duration) * 100}%` }"
        >
          <span class="tick-label">{{ i - 1 }}s</span>
        </div>
        <!-- 播放头 -->
        <div class="playhead" :style="{ left: `${playheadPos}%` }">
          <div class="playhead-top"></div>
          <div class="playhead-line"></div>
        </div>
      </div>

      <!-- 轨道区 -->
      <div class="tracks-area">
        <div 
          v-for="(layer, index) in store.layers"
          :key="layer.id"
          class="track-row"
          :class="{ active: index === store.currentLayerIndex }"
          @click.stop="onTrackClick($event, index)"
        >
          <!-- 关键帧 -->
          <div
            v-for="(kf, kfIdx) in getLayerKeyframes(layer)"
            :key="kfIdx"
            class="keyframe"
            :class="{ current: Math.abs(kf.time - store.currentTime) < 0.02 }"
            :style="{ left: `${(kf.time / store.project.duration) * 100}%` }"
            :title="`${kf.prop}: ${kf.value.toFixed(2)}`"
          ></div>
        </div>
        <!-- 播放头延伸线 -->
        <div class="playhead-ext" :style="{ left: `${playheadPos}%` }"></div>
      </div>
    </div>

    <!-- 底部属性区（选中图层时） -->
    <div class="props-bar" v-if="store.currentLayer && store.currentLayer.type !== 'background'">
      <div class="prop-item">
        <label>X</label>
        <input type="number" v-model.number="store.currentLayer.x" step="1" />
      </div>
      <div class="prop-item">
        <label>Y</label>
        <input type="number" v-model.number="store.currentLayer.y" step="1" />
      </div>
      <div class="prop-item">
        <label>缩放</label>
        <input type="number" v-model.number="store.currentLayer.scale" step="0.01" />
      </div>
      <div class="prop-item">
        <label>旋转</label>
        <input type="number" v-model.number="store.currentLayer.rotation" step="1" />
      </div>
      <div class="prop-item">
        <label>不透明度</label>
        <input type="number" v-model.number="store.currentLayer.opacity" step="0.05" min="0" max="1" />
      </div>
    </div>
    <div class="props-bar" v-else-if="store.currentLayer && store.currentLayer.type === 'background'">
      <div class="prop-item">
        <label>填充模式</label>
        <select v-model="store.currentLayer.bg_mode">
          <option value="fit">适应</option>
          <option value="fill">填充</option>
          <option value="stretch">拉伸</option>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTimelineStore } from '@/stores/timelineStore'

const store = useTimelineStore()
const timelinePanel = ref<HTMLElement>()

const tickCount = computed(() => Math.ceil(store.project.duration) + 1)
const playheadPos = computed(() => (store.currentTime / store.project.duration) * 100)

function getLayerKeyframes(layer: any) {
  const kfs: { time: number; prop: string; value: number }[] = []
  const props = ['x', 'y', 'scale', 'rotation', 'opacity', 'mask_size']
  for (const prop of props) {
    for (const f of (layer.keyframes?.[prop] || [])) {
      kfs.push({ time: f.time, prop, value: f.value })
    }
  }
  return kfs
}

function onRulerClick(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  store.setCurrentTime(ratio * store.project.duration)
}

function onTrackClick(e: MouseEvent, index: number) {
  store.selectLayer(index)
  const el = e.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  store.setCurrentTime(ratio * store.project.duration)
}
</script>

<style scoped>
.ae-timeline {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
  font-size: 11px;
}

/* 左侧图层面板 + 右侧时间轴 水平布局 */
.ae-timeline {
  display: grid;
  grid-template-columns: 180px 1fr;
  grid-template-rows: 1fr auto;
}

/* 左侧图层面板 */
.layers-panel {
  grid-row: 1;
  grid-column: 1;
  display: flex;
  flex-direction: column;
  background: #222;
  border-right: 1px solid #333;
  overflow: hidden;
}

.layers-header {
  display: flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  background: #2a2a2a;
  border-bottom: 1px solid #333;
  font-size: 10px;
  color: #888;
}

.col-vis { width: 24px; text-align: center; }
.col-name { flex: 1; }

.layers-list {
  flex: 1;
  overflow-y: auto;
}

.empty-msg {
  padding: 16px;
  text-align: center;
  color: #555;
}

.layer-row {
  display: flex;
  align-items: center;
  height: 28px;
  padding: 0 4px;
  border-bottom: 1px solid #2a2a2a;
  cursor: pointer;
  transition: background 0.1s;
}

.layer-row:hover { background: #2a2a2a; }
.layer-row.active { background: #3a5070; }

.layer-vis { width: 24px; text-align: center; font-size: 10px; }
.layer-icon { width: 20px; text-align: center; }
.layer-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #ccc;
}
.layer-row.active .layer-name { color: #fff; }

.layer-del {
  width: 18px;
  height: 18px;
  background: transparent;
  border: none;
  color: #666;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s;
}
.layer-row:hover .layer-del { opacity: 1; }
.layer-del:hover { color: #f44; }

/* 右侧时间轴 */
.timeline-panel {
  grid-row: 1;
  grid-column: 2;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.time-ruler {
  position: relative;
  height: 24px;
  background: #2a2a2a;
  border-bottom: 1px solid #333;
  cursor: pointer;
}

.tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #444;
}

.tick-label {
  position: absolute;
  top: 6px;
  left: 4px;
  font-size: 9px;
  color: #777;
  font-family: monospace;
}

.playhead {
  position: absolute;
  top: 0;
  z-index: 10;
}

.playhead-top {
  width: 12px;
  height: 12px;
  margin-left: -6px;
  background: #e74c3c;
  clip-path: polygon(0 0, 100% 0, 100% 60%, 50% 100%, 0 60%);
}

.playhead-line {
  position: absolute;
  top: 12px;
  left: -1px;
  width: 2px;
  height: 200px;
  background: #e74c3c;
  pointer-events: none;
}

.tracks-area {
  flex: 1;
  position: relative;
  overflow-y: auto;
  background: #1a1a1a;
}

.track-row {
  position: relative;
  height: 28px;
  border-bottom: 1px solid #2a2a2a;
  cursor: pointer;
}

.track-row:hover { background: #222; }
.track-row.active { background: #2a3545; }

.keyframe {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%) rotate(45deg);
  width: 8px;
  height: 8px;
  background: #3498db;
  border: 1px solid #5dade2;
  z-index: 5;
}

.keyframe.current {
  background: #e74c3c;
  border-color: #ec7063;
  transform: translate(-50%, -50%) rotate(45deg) scale(1.2);
}

.playhead-ext {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #e74c3c;
  pointer-events: none;
  z-index: 8;
}

/* 底部属性栏 */
.props-bar {
  grid-row: 2;
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 12px;
  background: #252525;
  border-top: 1px solid #333;
}

.prop-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.prop-item label {
  font-size: 10px;
  color: #888;
  min-width: 50px;
}

.prop-item input,
.prop-item select {
  width: 70px;
  padding: 4px 6px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 3px;
  color: #fff;
  font-size: 11px;
  font-family: monospace;
}

.prop-item input:focus,
.prop-item select:focus {
  outline: none;
  border-color: #3498db;
}
</style>
