import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Keyframe {
  time: number
  value: number
}

export interface BezierPoint {
  x: number
  y: number
  cp1x?: number  // 控制点1
  cp1y?: number
  cp2x?: number  // 控制点2
  cp2y?: number
  time?: number  // 该点对应的时间
}

export interface Layer {
  id: string
  name: string
  type: 'foreground' | 'background'
  image_data?: string
  img?: HTMLImageElement
  // 2D 变换
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
  // 3D 变换
  rotationX?: number  // X轴旋转
  rotationY?: number  // Y轴旋转
  rotationZ?: number  // Z轴旋转（等同于rotation）
  anchorX?: number    // 锚点X
  anchorY?: number    // 锚点Y
  perspective?: number // 透视距离
  // Mask
  mask_size: number
  customMask?: string
  maskCanvas?: HTMLCanvasElement
  // 路径动画
  bezierPath?: BezierPoint[]
  usePathAnimation?: boolean
  // 其他
  keyframes: Record<string, Keyframe[]>
  bg_mode?: 'fit' | 'fill' | 'stretch'
  [key: string]: any
}

export interface Project {
  width: number
  height: number
  fps: number
  duration: number
  total_frames: number
  mask_expansion: number
  mask_feather: number
}

export const useTimelineStore = defineStore('timeline', () => {
  // Project settings
  const project = ref<Project>({
    width: 1280,
    height: 720,
    fps: 30,
    duration: 5,
    total_frames: 150,
    mask_expansion: 0,
    mask_feather: 0
  })

  // Layers
  const layers = ref<Layer[]>([])
  const currentLayerIndex = ref<number>(-1)

  // Playback
  const currentTime = ref<number>(0)
  const currentFrame = ref<number>(0)
  const isPlaying = ref<boolean>(false)

  // Tools
  const maskMode = ref({
    enabled: false,
    drawing: false,
    erase: false,
    brush: 20
  })

  const pathMode = ref({
    enabled: false,
    data: null as any
  })

  const extractMode = ref({
    enabled: false,
    drawing: false,
    brush: 30,
    blurType: 'gaussian'
  })

  // Computed
  const currentLayer = computed(() => {
    if (currentLayerIndex.value >= 0 && currentLayerIndex.value < layers.value.length) {
      return layers.value[currentLayerIndex.value]
    }
    return null
  })

  const foregroundLayers = computed(() => 
    layers.value.filter(l => l.type === 'foreground')
  )

  const backgroundLayer = computed(() => 
    layers.value.find(l => l.type === 'background')
  )

  // Actions
  function setProject(data: Partial<Project>) {
    Object.assign(project.value, data)
    if (data.fps && data.duration) {
      project.value.total_frames = Math.floor(data.fps * data.duration)
    }
  }

  function addLayer(layer: Layer) {
    layers.value.push(layer)
    // 自动选中新添加的图层
    currentLayerIndex.value = layers.value.length - 1
  }

  function removeLayer(index: number) {
    if (index >= 0 && index < layers.value.length) {
      layers.value.splice(index, 1)
      if (currentLayerIndex.value >= layers.value.length) {
        currentLayerIndex.value = layers.value.length - 1
      }
    }
  }

  function clearLayers() {
    layers.value = []
    currentLayerIndex.value = -1
  }

  function selectLayer(index: number) {
    if (index >= 0 && index < layers.value.length) {
      currentLayerIndex.value = index
    }
  }

  function updateLayer(index: number, updates: Partial<Layer>) {
    if (index >= 0 && index < layers.value.length) {
      Object.assign(layers.value[index], updates)
    }
  }

  function setCurrentTime(time: number) {
    currentTime.value = Math.max(0, Math.min(time, project.value.duration))
    currentFrame.value = Math.floor(currentTime.value * project.value.fps)
  }

  function setCurrentFrame(frame: number) {
    currentFrame.value = Math.max(0, Math.min(frame, project.value.total_frames - 1))
    currentTime.value = currentFrame.value / project.value.fps
  }

  let playbackId: number | null = null
  let lastPlayTime = 0

  function togglePlayback() {
    isPlaying.value = !isPlaying.value
    if (isPlaying.value) {
      startPlayback()
    } else {
      stopPlaybackLoop()
    }
  }

  function startPlayback() {
    lastPlayTime = performance.now()
    playbackLoop()
  }

  function playbackLoop() {
    if (!isPlaying.value) return
    
    const now = performance.now()
    const deltaTime = (now - lastPlayTime) / 1000  // 转换为秒
    lastPlayTime = now
    
    let newTime = currentTime.value + deltaTime
    
    // 循环播放
    if (newTime >= project.value.duration) {
      newTime = 0
    }
    
    setCurrentTime(newTime)
    playbackId = requestAnimationFrame(playbackLoop)
  }

  function stopPlaybackLoop() {
    if (playbackId !== null) {
      cancelAnimationFrame(playbackId)
      playbackId = null
    }
  }

  function stopPlayback() {
    isPlaying.value = false
    stopPlaybackLoop()
    setCurrentTime(0)
  }

  function loadAnimation(animation: any) {
    if (!animation) return
    
    const proj = animation.project || {}
    setProject({
      width: proj.width || 1280,
      height: proj.height || 720,
      fps: proj.fps || 30,
      duration: proj.duration || 5,
      total_frames: proj.total_frames || 150,
      mask_expansion: proj.mask_expansion || 0,
      mask_feather: proj.mask_feather || 0
    })

    layers.value = (animation.layers || []).map((l: any) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      image_data: l.image_data,
      // 2D 变换
      x: l.x || 0,
      y: l.y || 0,
      scale: l.scale || 1,
      rotation: l.rotation || 0,
      opacity: l.opacity !== undefined ? l.opacity : 1,
      // 3D 变换
      rotationX: l.rotationX || 0,
      rotationY: l.rotationY || 0,
      rotationZ: l.rotationZ || 0,
      anchorX: l.anchorX || 0,
      anchorY: l.anchorY || 0,
      perspective: l.perspective || 1000,
      // Mask
      mask_size: l.mask_size || 0,
      customMask: l.customMask,
      // 路径动画
      bezierPath: l.bezierPath,
      usePathAnimation: l.usePathAnimation || false,
      // 其他
      keyframes: l.keyframes || {},
      bg_mode: l.bg_mode || 'fit'
    }))
  }

  function addKeyframe() {
    const layer = currentLayer.value
    if (!layer) return

    // 包含 2D 和 3D 属性
    const props: (keyof Layer)[] = [
      'x', 'y', 'scale', 'rotation', 'opacity', 'mask_size',
      'rotationX', 'rotationY', 'rotationZ', 'anchorX', 'anchorY', 'perspective'
    ]
    if (!layer.keyframes) layer.keyframes = {}

    for (const prop of props) {
      let currentValue = layer[prop]
      if (currentValue === undefined) {
        if (prop === 'scale' || prop === 'opacity') currentValue = 1
        else if (prop === 'perspective') currentValue = 1000
        else currentValue = 0
      }
      
      if (!layer.keyframes[prop]) layer.keyframes[prop] = []
      layer.keyframes[prop] = layer.keyframes[prop].filter((kf: Keyframe) => kf.time !== currentTime.value)
      layer.keyframes[prop].push({ time: currentTime.value, value: currentValue as number })
      layer.keyframes[prop].sort((a: Keyframe, b: Keyframe) => a.time - b.time)
    }
  }

  function deleteKeyframe() {
    const layer = currentLayer.value
    if (!layer || !layer.keyframes) return

    const props: (keyof Layer)[] = ['x', 'y', 'scale', 'rotation', 'opacity', 'mask_size']
    for (const prop of props) {
      if (layer.keyframes[prop]) {
        layer.keyframes[prop] = layer.keyframes[prop].filter((kf: Keyframe) => kf.time !== currentTime.value)
      }
    }
  }

  function clearAllKeyframes() {
    const layer = currentLayer.value
    if (!layer) return
    layer.keyframes = {}
  }

  function exportAnimation() {
    return {
      project: { ...project.value },
      layers: layers.value.map(l => ({
        id: l.id,
        name: l.name,
        type: l.type,
        image_data: l.image_data,
        // 2D 变换
        x: l.x,
        y: l.y,
        scale: l.scale,
        rotation: l.rotation,
        opacity: l.opacity,
        // 3D 变换
        rotationX: l.rotationX,
        rotationY: l.rotationY,
        rotationZ: l.rotationZ,
        anchorX: l.anchorX,
        anchorY: l.anchorY,
        perspective: l.perspective,
        // Mask
        mask_size: l.mask_size,
        customMask: l.customMask,
        // 路径动画
        bezierPath: l.bezierPath,
        usePathAnimation: l.usePathAnimation,
        // 其他
        keyframes: l.keyframes,
        bg_mode: l.bg_mode
      }))
    }
  }

  return {
    // State
    project,
    layers,
    currentLayerIndex,
    currentTime,
    currentFrame,
    isPlaying,
    maskMode,
    pathMode,
    extractMode,

    // Computed
    currentLayer,
    foregroundLayers,
    backgroundLayer,

    // Actions
    setProject,
    addLayer,
    removeLayer,
    clearLayers,
    selectLayer,
    updateLayer,
    setCurrentTime,
    setCurrentFrame,
    togglePlayback,
    stopPlayback,
    addKeyframe,
    deleteKeyframe,
    clearAllKeyframes,
    loadAnimation,
    exportAnimation
  }
})
