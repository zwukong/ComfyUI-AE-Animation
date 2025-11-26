<template>
  <div class="project-settings">
    <div class="section-title">📐 项目</div>
    
    <div class="setting-row">
      <label>宽度</label>
      <input type="number" :value="store.project.width" @input="updateWidth" min="64" max="8192" />
    </div>
    <div class="setting-row">
      <label>高度</label>
      <input type="number" :value="store.project.height" @input="updateHeight" min="64" max="8192" />
    </div>
    <div class="setting-row">
      <label>帧率</label>
      <input type="number" :value="store.project.fps" @input="updateFps" min="1" max="120" />
    </div>
    <div class="setting-row">
      <label>帧数</label>
      <input type="number" :value="store.project.total_frames" @input="updateFrames" min="1" max="9999" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTimelineStore } from '@/stores/timelineStore'

const store = useTimelineStore()

function updateWidth(e: Event) {
  store.setProject({ width: parseInt((e.target as HTMLInputElement).value) || 1280 })
}
function updateHeight(e: Event) {
  store.setProject({ height: parseInt((e.target as HTMLInputElement).value) || 720 })
}
function updateFps(e: Event) {
  store.setProject({ fps: parseInt((e.target as HTMLInputElement).value) || 30 })
}
function updateFrames(e: Event) {
  store.setProject({ total_frames: parseInt((e.target as HTMLInputElement).value) || 150 })
}
</script>

<style scoped>
.project-settings {
  padding: 12px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  margin-bottom: 12px;
  padding-bottom: 6px;
  border-bottom: 1px solid #333;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.setting-row label {
  font-size: 11px;
  color: #888;
}

.setting-row input {
  width: 80px;
  padding: 4px 6px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 3px;
  color: #fff;
  font-size: 11px;
  font-family: monospace;
  text-align: right;
}

.setting-row input:focus {
  outline: none;
  border-color: #3a7bc8;
}
</style>
