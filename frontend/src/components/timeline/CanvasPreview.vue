<template>
  <div class="canvas-preview" ref="containerRef">
    <!-- WebGPU Canvas (hidden when not using GPU) -->
    <canvas 
      v-show="useGPU"
      ref="gpuCanvasRef"
      :width="store.project.width"
      :height="store.project.height"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @wheel.prevent="onWheel"
      @contextmenu.prevent
      tabindex="0"
      @keydown="onKeyDown"
    />
    <!-- Canvas 2D Fallback -->
    <canvas 
      v-show="!useGPU"
      ref="canvasRef"
      :width="store.project.width"
      :height="store.project.height"
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
        <span class="gpu-badge" v-if="useGPU">GPU</span>
        Layer {{ store.currentLayerIndex + 1 }} | X:{{ Math.round(store.currentLayer.x || 0) }} Y:{{ Math.round(store.currentLayer.y || 0) }} S:{{ (store.currentLayer.scale || 1).toFixed(2) }} R:{{ Math.round(store.currentLayer.rotation || 0) }}°
      </span>
      <span v-else>No layer selected</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { useTimelineStore } from '@/stores/timelineStore'
import TGPU from 'typegpu'

const store = useTimelineStore()
const canvasRef = ref<HTMLCanvasElement>()
const gpuCanvasRef = ref<HTMLCanvasElement>()
const containerRef = ref<HTMLDivElement>()

let isDragging = false
let dragStartX = 0
let dragStartY = 0
let dragStartLayerX = 0
let dragStartLayerY = 0
let shiftKey = false
let altKey = false

// GPU 渲染状态
const useGPU = ref(false)
let gpuDevice: GPUDevice | null = null
let gpuContext: GPUCanvasContext | null = null
let gpuFormat: GPUTextureFormat = 'bgra8unorm'

// Canvas 2D fallback
let renderPending = false
let ctx: CanvasRenderingContext2D | null = null
const imageCache = new Map<string, HTMLImageElement>()

// GPU 纹理缓存
const gpuTextureCache = new Map<string, GPUTexture>()
let gpuSampler: GPUSampler | null = null
let gpuPipeline: GPURenderPipeline | null = null
let gpuUniformBuffer: GPUBuffer | null = null
let gpuBindGroupLayout: GPUBindGroupLayout | null = null

onMounted(async () => {
  // 先初始化 Canvas 2D 作为后备
  if (canvasRef.value) {
    ctx = canvasRef.value.getContext('2d', { 
      alpha: false,
      desynchronized: true
    })
  }
  
  // 尝试初始化 WebGPU
  await initWebGPU()
  
  scheduleRender()
})

onUnmounted(() => {
  imageCache.clear()
  destroyGPU()
})

// 初始化 WebGPU
async function initWebGPU() {
  // TODO: GPU 渲染有 uniform buffer 覆盖问题，暂时禁用
  // 使用 Canvas 2D 确保稳定性
  console.log('[Timeline GPU] GPU rendering disabled, using Canvas 2D for stability')
  useGPU.value = false
  return
  
  /*
  try {
    // 检查 WebGPU 支持
    if (!navigator.gpu) {
      console.log('[Timeline GPU] WebGPU not supported')
      return
    }

    // 初始化 TypeGPU
    console.log('[Timeline GPU] Initializing TypeGPU...')
    const root = await TGPU.init()
    gpuDevice = root.device
    console.log('[Timeline GPU] Device ready:', gpuDevice.limits.maxTextureDimension2D)
    
    // 获取 canvas context
    if (!gpuCanvasRef.value) {
      console.warn('[Timeline GPU] Canvas ref not ready')
      return
    }
    
    const ctx = gpuCanvasRef.value.getContext('webgpu')
    if (!ctx) {
      console.warn('[Timeline GPU] Failed to get WebGPU context')
      return
    }
    
    gpuContext = ctx
    gpuFormat = navigator.gpu.getPreferredCanvasFormat()
    
    gpuContext.configure({
      device: gpuDevice,
      format: gpuFormat,
      alphaMode: 'premultiplied'
    })

    // 创建采样器
    gpuSampler = gpuDevice.createSampler({
      magFilter: 'linear',
      minFilter: 'linear'
    })

    // 创建 uniform buffer
    gpuUniformBuffer = gpuDevice.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    })

    // 创建 bind group layout
    gpuBindGroupLayout = gpuDevice.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} }
      ]
    })

    // 创建渲染管线
    gpuPipeline = createGPUPipeline()
    if (!gpuPipeline) {
      console.warn('[Timeline GPU] Failed to create pipeline')
      return
    }

    useGPU.value = true
    console.log('[Timeline GPU] ✅ Fully initialized')
  } catch (e) {
    console.warn('[Timeline GPU] Init failed:', e)
    useGPU.value = false
  }
  */
}

function createGPUPipeline(): GPURenderPipeline | null {
  if (!gpuDevice || !gpuBindGroupLayout) return null

  const shaderCode = `
    struct Uniforms {
      transform: mat4x4<f32>,
      opacity: f32,
    }
    @group(0) @binding(0) var<uniform> uniforms: Uniforms;
    @group(0) @binding(1) var texSampler: sampler;
    @group(0) @binding(2) var tex: texture_2d<f32>;

    struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }

    @vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
      var p = array<vec2f, 6>(vec2f(-1,-1), vec2f(1,-1), vec2f(1,1), vec2f(-1,-1), vec2f(1,1), vec2f(-1,1));
      var u = array<vec2f, 6>(vec2f(0,1), vec2f(1,1), vec2f(1,0), vec2f(0,1), vec2f(1,0), vec2f(0,0));
      var o: VSOut;
      o.pos = uniforms.transform * vec4f(p[i], 0, 1);
      o.uv = u[i];
      return o;
    }

    @fragment fn fs(@location(0) uv: vec2f) -> @location(0) vec4f {
      let c = textureSample(tex, texSampler, uv);
      return vec4f(c.rgb, c.a * uniforms.opacity);
    }
  `

  return gpuDevice.createRenderPipeline({
    layout: gpuDevice.createPipelineLayout({ bindGroupLayouts: [gpuBindGroupLayout] }),
    vertex: { module: gpuDevice.createShaderModule({ code: shaderCode }), entryPoint: 'vs' },
    fragment: {
      module: gpuDevice.createShaderModule({ code: shaderCode }),
      entryPoint: 'fs',
      targets: [{
        format: gpuFormat,
        blend: {
          color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
        }
      }]
    },
    primitive: { topology: 'triangle-list' }
  })
}

function destroyGPU() {
  for (const tex of gpuTextureCache.values()) tex.destroy()
  gpuTextureCache.clear()
  gpuUniformBuffer?.destroy()
  gpuDevice = null
  gpuContext = null
}

// 使用 requestAnimationFrame 进行批量渲染
function scheduleRender() {
  if (renderPending) return
  renderPending = true
  requestAnimationFrame(() => {
    renderPending = false
    render()
  })
}

watch(() => [store.layers, store.currentLayer, store.currentTime], () => {
  scheduleRender()
}, { deep: true })

watch(() => store.extractMode.enabled, () => {
  isExtractDrawing = false
  scheduleRender()
})

// GPU 渲染 - 同步方式
function renderGPU() {
  if (!gpuDevice || !gpuContext || !gpuPipeline || !gpuSampler || !gpuUniformBuffer || !gpuBindGroupLayout) {
    // 回退到 Canvas 2D
    renderCanvas2D()
    return
  }

  try {
    const encoder = gpuDevice.createCommandEncoder()
    const textureView = gpuContext.getCurrentTexture().createView()

    // 收集可渲染的图层（已有缓存纹理的）
    const renderableLayers: Array<{layer: any, texture: GPUTexture, props: any}> = []
    
    for (const layer of store.layers) {
      if (!layer.image_data && !layer.img) continue
      
      const texture = gpuTextureCache.get(layer.id)
      if (texture && layer.img) {
        renderableLayers.push({
          layer,
          texture,
          props: getLayerProps(layer)
        })
      } else {
        // 异步加载纹理，下一帧渲染
        loadGPUTexture(layer)
      }
    }

    // 单个 render pass 渲染所有图层
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: textureView,
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        storeOp: 'store'
      }]
    })

    pass.setPipeline(gpuPipeline)

    for (const { layer, texture, props } of renderableLayers) {
      const matrix = createTransformMatrix(props, layer.img.width, layer.img.height)
      
      const uniformData = new Float32Array(20)
      uniformData.set(matrix)
      uniformData[16] = props.opacity
      gpuDevice.queue.writeBuffer(gpuUniformBuffer, 0, uniformData)

      const bindGroup = gpuDevice.createBindGroup({
        layout: gpuBindGroupLayout!,
        entries: [
          { binding: 0, resource: { buffer: gpuUniformBuffer } },
          { binding: 1, resource: gpuSampler },
          { binding: 2, resource: texture.createView() }
        ]
      })

      pass.setBindGroup(0, bindGroup)
      pass.draw(6)
    }

    pass.end()
    gpuDevice.queue.submit([encoder.finish()])
  } catch (e) {
    console.warn('[Timeline GPU] Render error:', e)
    // 回退到 Canvas 2D
    useGPU.value = false
    renderCanvas2D()
  }
}

// 异步加载 GPU 纹理
async function loadGPUTexture(layer: any) {
  if (!gpuDevice || gpuTextureCache.has(layer.id)) return
  
  try {
    const img = layer.img || await loadImage(layer.image_data)
    if (!img || !gpuDevice) return
    
    layer.img = img
    
    const texture = gpuDevice.createTexture({
      size: [img.width, img.height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT
    })

    const imageBitmap = await createImageBitmap(img)
    gpuDevice.queue.copyExternalImageToTexture(
      { source: imageBitmap },
      { texture },
      [img.width, img.height]
    )

    gpuTextureCache.set(layer.id, texture)
    scheduleRender() // 纹理加载完成后重新渲染
  } catch (e) {
    console.warn('[Timeline GPU] Texture load error:', e)
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function createTransformMatrix(props: any, imgW: number, imgH: number): Float32Array {
  const canvasW = store.project.width
  const canvasH = store.project.height
  
  // 计算 NDC 坐标
  const x = props.x / canvasW * 2
  const y = -props.y / canvasH * 2
  const scaleX = (imgW * props.scale) / canvasW
  const scaleY = (imgH * props.scale) / canvasH
  
  const cos = Math.cos(props.rotation * Math.PI / 180)
  const sin = Math.sin(props.rotation * Math.PI / 180)

  // Column-major 4x4 矩阵
  return new Float32Array([
    scaleX * cos, scaleX * sin, 0, 0,
    -scaleY * sin, scaleY * cos, 0, 0,
    0, 0, 1, 0,
    x, y, 0, 1
  ])
}

// 获取或缓存图片
function getCachedImage(layer: any): HTMLImageElement | null {
  if (layer.img) return layer.img
  if (!layer.image_data) return null
  
  const cacheKey = layer.id
  if (imageCache.has(cacheKey)) {
    const img = imageCache.get(cacheKey)!
    if (img.complete) {
      layer.img = img
      return img
    }
    return null
  }
  
  const img = new Image()
  img.onload = () => {
    layer.img = img
    scheduleRender()
  }
  img.src = layer.image_data
  imageCache.set(cacheKey, img)
  return null
}

// 关键帧插值
function interpolateValue(keyframes: any[], time: number, defaultValue: number): number {
  if (!keyframes || keyframes.length === 0) return defaultValue
  
  const sorted = [...keyframes].sort((a, b) => a.time - b.time)
  
  if (time <= sorted[0].time) return sorted[0].value
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value
  
  // 找到当前时间所在的两个关键帧之间
  for (let i = 0; i < sorted.length - 1; i++) {
    if (time >= sorted[i].time && time <= sorted[i + 1].time) {
      const t = (time - sorted[i].time) / (sorted[i + 1].time - sorted[i].time)
      // 线性插值
      return sorted[i].value + (sorted[i + 1].value - sorted[i].value) * t
    }
  }
  
  return defaultValue
}

// 贝塞尔曲线插值
function interpolateBezierPath(path: any[], time: number, duration: number): { x: number, y: number } | null {
  if (!path || path.length < 2) return null
  
  const t = time / duration  // 归一化时间 0-1
  const totalPoints = path.length
  const segmentCount = totalPoints - 1
  const currentSegment = Math.min(Math.floor(t * segmentCount), segmentCount - 1)
  const segmentT = (t * segmentCount) - currentSegment
  
  const p0 = path[currentSegment]
  const p1 = path[currentSegment + 1]
  
  if (!p0 || !p1) return null
  
  // 三次贝塞尔曲线插值
  const cp1x = p0.cp2x ?? (p0.x + (p1.x - p0.x) / 3)
  const cp1y = p0.cp2y ?? (p0.y + (p1.y - p0.y) / 3)
  const cp2x = p1.cp1x ?? (p0.x + (p1.x - p0.x) * 2 / 3)
  const cp2y = p1.cp1y ?? (p0.y + (p1.y - p0.y) * 2 / 3)
  
  const mt = 1 - segmentT
  const mt2 = mt * mt
  const mt3 = mt2 * mt
  const t2 = segmentT * segmentT
  const t3 = t2 * segmentT
  
  return {
    x: mt3 * p0.x + 3 * mt2 * segmentT * cp1x + 3 * mt * t2 * cp2x + t3 * p1.x,
    y: mt3 * p0.y + 3 * mt2 * segmentT * cp1y + 3 * mt * t2 * cp2y + t3 * p1.y
  }
}

// 获取图层在当前时间的属性值（包含 2D、3D 和路径动画）
function getLayerProps(layer: any) {
  const time = store.currentTime
  const kf = layer.keyframes || {}
  
  // 基础 2D 属性
  let x = interpolateValue(kf.x, time, layer.x || 0)
  let y = interpolateValue(kf.y, time, layer.y || 0)
  
  // 如果启用了路径动画，使用贝塞尔路径
  if (layer.usePathAnimation && layer.bezierPath && layer.bezierPath.length >= 2) {
    const pathPos = interpolateBezierPath(layer.bezierPath, time, store.project.duration)
    if (pathPos) {
      x = pathPos.x
      y = pathPos.y
    }
  }
  
  return {
    // 2D 变换
    x,
    y,
    scale: interpolateValue(kf.scale, time, layer.scale || 1),
    rotation: interpolateValue(kf.rotation, time, layer.rotation || 0),
    opacity: interpolateValue(kf.opacity, time, layer.opacity ?? 1),
    mask_size: interpolateValue(kf.mask_size, time, layer.mask_size || 0),
    // 3D 变换
    rotationX: interpolateValue(kf.rotationX, time, layer.rotationX || 0),
    rotationY: interpolateValue(kf.rotationY, time, layer.rotationY || 0),
    rotationZ: interpolateValue(kf.rotationZ, time, layer.rotationZ || 0),
    anchorX: interpolateValue(kf.anchorX, time, layer.anchorX || 0),
    anchorY: interpolateValue(kf.anchorY, time, layer.anchorY || 0),
    perspective: interpolateValue(kf.perspective, time, layer.perspective || 1000)
  }
}

function render() {
  // 使用 GPU 渲染
  if (useGPU.value) {
    renderGPU()
    return
  }

  // Canvas 2D 回退
  renderCanvas2D()
}

function renderCanvas2D() {
  if (!canvasRef.value || !ctx) return

  // 清空画布
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, store.project.width, store.project.height)

  // 绘制背景层
  const bgLayer = store.layers.find(l => l.type === 'background')
  if (bgLayer) {
    drawBackgroundLayer(ctx, bgLayer)
  }

  // 绘制前景层（按数组顺序）
  store.layers.filter(l => l.type !== 'background').forEach(layer => {
    drawForegroundLayer(ctx, layer)
  })

  // 绘制路径（如果在路径编辑模式）
  if (store.pathMode.enabled && store.currentLayer?.bezierPath) {
    drawBezierPath(ctx, store.currentLayer.bezierPath)
  }

  // 绘制背景提取选区叠加层
  if (store.extractMode.enabled) {
    drawExtractOverlay(ctx)
  }
}

// 绘制贝塞尔路径
function drawBezierPath(ctx: CanvasRenderingContext2D, path: any[]) {
  if (!path || path.length === 0) return
  
  const centerX = store.project.width / 2
  const centerY = store.project.height / 2
  
  ctx.save()
  ctx.strokeStyle = '#ff6b6b'
  ctx.lineWidth = 2
  ctx.setLineDash([5, 5])
  
  // 绘制路径线
  ctx.beginPath()
  ctx.moveTo(centerX + path[0].x, centerY + path[0].y)
  
  for (let i = 1; i < path.length; i++) {
    const p0 = path[i - 1]
    const p1 = path[i]
    
    const cp1x = p0.cp2x ?? (p0.x + (p1.x - p0.x) / 3)
    const cp1y = p0.cp2y ?? (p0.y + (p1.y - p0.y) / 3)
    const cp2x = p1.cp1x ?? (p0.x + (p1.x - p0.x) * 2 / 3)
    const cp2y = p1.cp1y ?? (p0.y + (p1.y - p0.y) * 2 / 3)
    
    ctx.bezierCurveTo(
      centerX + cp1x, centerY + cp1y,
      centerX + cp2x, centerY + cp2y,
      centerX + p1.x, centerY + p1.y
    )
  }
  ctx.stroke()
  ctx.setLineDash([])
  
  // 绘制路径点
  path.forEach((pt, i) => {
    ctx.beginPath()
    ctx.arc(centerX + pt.x, centerY + pt.y, 6, 0, Math.PI * 2)
    ctx.fillStyle = i === 0 ? '#4ecdc4' : (i === path.length - 1 ? '#ff6b6b' : '#ffe66d')
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
  })

  // 在路径终点绘制方向箭头，增强方向感知
  if (path.length >= 2) {
    const lastIndex = path.length - 1
    const p0 = path[lastIndex - 1]
    const p1 = path[lastIndex]

    const cp1x = p0.cp2x ?? (p0.x + (p1.x - p0.x) / 3)
    const cp1y = p0.cp2y ?? (p0.y + (p1.y - p0.y) / 3)
    const cp2x = p1.cp1x ?? (p0.x + (p1.x - p0.x) * 2 / 3)
    const cp2y = p1.cp1y ?? (p0.y + (p1.y - p0.y) * 2 / 3)

    // 使用 t 接近 1 的导数近似终点切线方向
    const t = 0.99
    const mt = 1 - t
    const dx =
      3 * mt * mt * (cp1x - p0.x) +
      6 * mt * t * (cp2x - cp1x) +
      3 * t * t * (p1.x - cp2x)
    const dy =
      3 * mt * mt * (cp1y - p0.y) +
      6 * mt * t * (cp2y - cp1y) +
      3 * t * t * (p1.y - cp2y)

    const angle = Math.atan2(dy, dx)
    const endX = centerX + p1.x
    const endY = centerY + p1.y
    const arrowLen = 18

    ctx.beginPath()
    ctx.moveTo(endX, endY)
    ctx.lineTo(
      endX - arrowLen * Math.cos(angle - Math.PI / 6),
      endY - arrowLen * Math.sin(angle - Math.PI / 6)
    )
    ctx.moveTo(endX, endY)
    ctx.lineTo(
      endX - arrowLen * Math.cos(angle + Math.PI / 6),
      endY - arrowLen * Math.sin(angle + Math.PI / 6)
    )
    ctx.strokeStyle = '#ff6b6b'
    ctx.lineWidth = 2
    ctx.stroke()
  }

  ctx.restore()
}

function drawBackgroundLayer(ctx: CanvasRenderingContext2D, layer: any) {
  const img = getCachedImage(layer)
  if (!img || img.width === 0 || img.height === 0) return

  // 获取插值后的属性
  const props = getLayerProps(layer)

  ctx.save()
  ctx.globalAlpha = props.opacity

  const mode = layer.bg_mode || 'fit'
  const canvasW = store.project.width
  const canvasH = store.project.height
  const imgW = img.width
  const imgH = img.height

  let baseScale = 1
  
  if (imgW > 0 && imgH > 0) {
    if (mode === 'fit') {
      baseScale = Math.min(canvasW / imgW, canvasH / imgH)
    } else if (mode === 'fill') {
      baseScale = Math.max(canvasW / imgW, canvasH / imgH)
    } else if (mode === 'stretch') {
      baseScale = Math.min(canvasW / imgW, canvasH / imgH)
    }
  }

  // 防止 scale 为无效值
  if (!Number.isFinite(baseScale) || baseScale <= 0) baseScale = 1

  // 应用变换
  ctx.translate(canvasW / 2 + props.x, canvasH / 2 + props.y)
  ctx.rotate((props.rotation * Math.PI) / 180)
  ctx.scale(props.scale * baseScale, props.scale * baseScale)

  // 绘制图像居中
  ctx.drawImage(img, -imgW / 2, -imgH / 2, imgW, imgH)


  // 选中时显示边框
  if (layer === store.currentLayer) {
    ctx.strokeStyle = '#3a7bc8'
    ctx.lineWidth = 2 / (props.scale * baseScale)
    ctx.strokeRect(-imgW / 2 - 2, -imgH / 2 - 2, imgW + 4, imgH + 4)
  }

  ctx.restore()
}

function drawForegroundLayer(ctx: CanvasRenderingContext2D, layer: any) {
  const img = getCachedImage(layer)
  if (!img || img.width === 0 || img.height === 0) return

  // 获取插值后的属性（支持动画）
  const props = getLayerProps(layer)
  const w = img.width
  const h = img.height

  ctx.save()
  
  // 移动到图层位置
  ctx.translate(
    store.project.width / 2 + props.x,
    store.project.height / 2 + props.y
  )
  
  // 应用 3D 变换（使用 CSS3D 风格的模拟）
  if (props.rotationX !== 0 || props.rotationY !== 0) {
    // 模拟 3D 透视效果
    const perspective = props.perspective || 1000
    const rx = props.rotationX * Math.PI / 180
    const ry = props.rotationY * Math.PI / 180
    
    // 简化的 3D 变换矩阵
    const cosX = Math.cos(rx)
    const sinX = Math.sin(rx)
    const cosY = Math.cos(ry)
    const sinY = Math.sin(ry)
    
    // 透视缩放
    const zScale = 1 / (1 + (sinY * w / 2 + sinX * h / 2) / perspective)
    
    ctx.transform(
      cosY * zScale, sinX * sinY * zScale,
      0, cosX * zScale,
      0, 0
    )
  }
  
  // 2D 旋转
  ctx.rotate((props.rotation * Math.PI) / 180)
  ctx.scale(props.scale, props.scale)
  ctx.globalAlpha = props.opacity

  // 应用锚点偏移
  const anchorOffsetX = (props.anchorX || 0) * w
  const anchorOffsetY = (props.anchorY || 0) * h

  // 绘制图像（支持遮罩）
  if (layer.maskCanvas) {
    // 使用离屏 Canvas 先把图像与遮罩合成，避免影响其他图层
    const offscreen = document.createElement('canvas')
    offscreen.width = w
    offscreen.height = h
    const offCtx = offscreen.getContext('2d')

    if (offCtx) {
      // 先画原始图像
      offCtx.clearRect(0, 0, w, h)
      offCtx.drawImage(img, 0, 0, w, h)

      // 再用 destination-in 应用遮罩：白色区域保留，黑色区域抠掉
      offCtx.globalCompositeOperation = 'destination-in'
      offCtx.drawImage(layer.maskCanvas, 0, 0, w, h)

      // 将合成结果画回主画布
      ctx.drawImage(
        offscreen,
        -w / 2 - anchorOffsetX,
        -h / 2 - anchorOffsetY,
        w,
        h
      )
    } else {
      // 回退：直接绘制原始图像
      ctx.drawImage(img, -w / 2 - anchorOffsetX, -h / 2 - anchorOffsetY, w, h)
    }
  } else {
    // 无遮罩时直接绘制
    ctx.drawImage(img, -w / 2 - anchorOffsetX, -h / 2 - anchorOffsetY, w, h)
  }

  // 绘制选中边框
  if (layer === store.currentLayer && layer.img) {
    ctx.strokeStyle = '#3a7bc8'
    ctx.lineWidth = 2 / props.scale
    const w = layer.img.width
    const h = layer.img.height
    ctx.strokeRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4)
    
    // 绘制控制点
    ctx.fillStyle = '#3a7bc8'
    const corners = [[-w/2, -h/2], [w/2, -h/2], [w/2, h/2], [-w/2, h/2]]
    corners.forEach(([cx, cy]) => {
      ctx.fillRect(cx - 4/props.scale, cy - 4/props.scale, 8/props.scale, 8/props.scale)
    })
  }

  // 绘制遮罩框
  if (props.mask_size > 0) {
    ctx.strokeStyle = '#3ac88e'
    ctx.lineWidth = 2 / props.scale
    ctx.setLineDash([5 / props.scale, 5 / props.scale])
    const w = layer.img ? layer.img.width : 512
    const h = layer.img ? layer.img.height : 512
    const maskW = w * props.mask_size
    const maskH = h * props.mask_size
    ctx.strokeRect(-maskW / 2, -maskH / 2, maskW, maskH)
    ctx.setLineDash([])
  }

  ctx.restore()
}

// 获取当前使用的 canvas
function getActiveCanvas(): HTMLCanvasElement | null {
  return useGPU.value ? gpuCanvasRef.value || null : canvasRef.value || null
}

// 获取画布坐标（考虑显示缩放）
function getCanvasCoords(e: MouseEvent) {
  const canvas = getActiveCanvas()
  if (!canvas) return { x: 0, y: 0 }
  
  const rect = canvas.getBoundingClientRect()
  const scaleX = store.project.width / rect.width
  const scaleY = store.project.height / rect.height
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  }
}

// Mask 绘制状态
let isMaskDrawing = false
let maskCtx: CanvasRenderingContext2D | null = null

// Extract 模式状态
let extractMaskCanvas: HTMLCanvasElement | null = null
let extractMaskCtx: CanvasRenderingContext2D | null = null
let isExtractDrawing = false
let extractSourceLayerId: string | null = null

// 路径编辑状态
let isPathEditing = false
let selectedPathPoint = -1

function onMouseDown(e: MouseEvent) {
  getActiveCanvas()?.focus()
  shiftKey = e.shiftKey
  altKey = e.altKey
  
  if (!store.currentLayer) return
  
  const coords = getCanvasCoords(e)

  // Extract 模式
  if (store.extractMode.enabled) {
    const resources = ensureExtractResources()
    if (!resources) {
      console.warn('[Timeline] Extract mode requires a background layer with image data')
      return
    }
    isExtractDrawing = true
    drawExtractPoint(coords.x, coords.y, e.button === 2 || e.altKey)
    return
  }
  
  // Mask 绘制模式
  if (store.maskMode.enabled) {
    isMaskDrawing = true
    initMaskCanvas()
    drawMaskPoint(coords.x, coords.y)
    return
  }
  
  // 路径编辑模式
  if (store.pathMode.enabled) {
    handlePathClick(coords, e)
    return
  }
  
  // 普通拖动模式
  isDragging = true
  dragStartX = coords.x
  dragStartY = coords.y
  
  const props = getLayerProps(store.currentLayer)
  dragStartLayerX = props.x
  dragStartLayerY = props.y
}

function onMouseMove(e: MouseEvent) {
  const coords = getCanvasCoords(e)

  if (store.extractMode.enabled && isExtractDrawing) {
    drawExtractPoint(coords.x, coords.y, (e.buttons & 2) === 2 || e.altKey)
    return
  }
  
  // Mask 绘制
  if (isMaskDrawing && store.maskMode.enabled) {
    drawMaskPoint(coords.x, coords.y)
    return
  }
  
  // 路径点拖动
  if (isPathEditing && selectedPathPoint >= 0) {
    updatePathPoint(coords)
    return
  }
  
  // 普通拖动
  if (!isDragging || !store.currentLayer) return
  
  let dx = coords.x - dragStartX
  let dy = coords.y - dragStartY
  
  if (e.shiftKey) {
    if (Math.abs(dx) > Math.abs(dy)) dy = 0
    else dx = 0
  }
  
  const newX = dragStartLayerX + dx
  const newY = dragStartLayerY + dy
  
  // 更新图层属性和关键帧
  updateLayerWithKeyframes(store.currentLayer, 'x', newX)
  updateLayerWithKeyframes(store.currentLayer, 'y', newY)
  
  scheduleRender()
}

// 更新图层属性，同时更新当前时间的关键帧
function updateLayerWithKeyframes(layer: any, prop: string, value: number) {
  const time = store.currentTime
  
  // 如果有关键帧，更新或创建当前时间的关键帧
  if (layer.keyframes && layer.keyframes[prop] && layer.keyframes[prop].length > 0) {
    const kfIndex = layer.keyframes[prop].findIndex((k: any) => Math.abs(k.time - time) < 0.05)
    if (kfIndex >= 0) {
      // 更新已有关键帧
      layer.keyframes[prop][kfIndex] = { time: layer.keyframes[prop][kfIndex].time, value }
    } else {
      // 当前时间没有关键帧，自动创建一个
      layer.keyframes[prop].push({ time, value })
      layer.keyframes[prop].sort((a: any, b: any) => a.time - b.time)
    }
  }
  
  // 更新基础值并触发响应式
  store.updateLayer(store.currentLayerIndex, { [prop]: value })
}

// 初始化 Mask 画布
function initMaskCanvas() {
  const layer = store.currentLayer
  if (!layer || !layer.img) return
  
  if (!layer.maskCanvas) {
    layer.maskCanvas = document.createElement('canvas')
    layer.maskCanvas.width = layer.img.width
    layer.maskCanvas.height = layer.img.height
    maskCtx = layer.maskCanvas.getContext('2d')
    
    if (maskCtx) {
      if (layer.customMask) {
        // 从保存的数据恢复 Mask
        const img = new Image()
        img.onload = () => {
          maskCtx?.drawImage(img, 0, 0)
          scheduleRender()
        }
        img.src = layer.customMask
      } else {
        // 初始全白（Alpha=1，完全显示）
        maskCtx.globalCompositeOperation = 'source-over'
        maskCtx.fillStyle = 'white'
        maskCtx.fillRect(0, 0, layer.maskCanvas.width, layer.maskCanvas.height)
      }
    }
  } else {
    maskCtx = layer.maskCanvas.getContext('2d')
  }
}

// 绘制 Mask 点
function drawMaskPoint(canvasX: number, canvasY: number) {
  const layer = store.currentLayer
  if (!layer) return

  // 若尚未初始化 Mask 画布，则尝试初始化
  if (!maskCtx || !layer.maskCanvas) {
    initMaskCanvas()
  }

  if (!layer.img || !maskCtx || !layer.maskCanvas) return
  
  const props = getLayerProps(layer)
  const centerX = store.project.width / 2 + props.x
  const centerY = store.project.height / 2 + props.y
  
  // 转换到图层本地坐标
  const localX = (canvasX - centerX) / props.scale + layer.img.width / 2
  const localY = (canvasY - centerY) / props.scale + layer.img.height / 2
  
  const brush = store.maskMode.brush || 20
  
  maskCtx.save()
  maskCtx.beginPath()
  maskCtx.arc(localX, localY, brush, 0, Math.PI * 2)
  
  if (!store.maskMode.erase) {
    // 画笔模式：挖空图像 -> 使遮罩变透明
    maskCtx.globalCompositeOperation = 'destination-out'
    maskCtx.fillStyle = 'black' // 颜色不重要，关键是 Alpha 操作
  } else {
    // 橡皮/还原模式：显示图像 -> 使遮罩变不透明
    maskCtx.globalCompositeOperation = 'source-over'
    maskCtx.fillStyle = 'white'
  }
  
  maskCtx.fill()
  maskCtx.restore()
  
  scheduleRender()
}

function ensureExtractResources() {
  const bgLayer = store.layers.find(l => l.type === 'background')
  if (!bgLayer) return null
  const img = getCachedImage(bgLayer)
  if (!img) return null

  if (
    !extractMaskCanvas ||
    !extractMaskCtx ||
    extractMaskCanvas.width !== img.width ||
    extractMaskCanvas.height !== img.height ||
    extractSourceLayerId !== bgLayer.id
  ) {
    extractMaskCanvas = document.createElement('canvas')
    extractMaskCanvas.width = img.width
    extractMaskCanvas.height = img.height
    extractMaskCtx = extractMaskCanvas.getContext('2d')
    if (extractMaskCtx) {
      // 初始全透明（Alpha=0，全不选）
      extractMaskCtx.clearRect(0, 0, img.width, img.height)
    }
    extractSourceLayerId = bgLayer.id || null
  }

  return {
    layer: bgLayer,
    img,
    ctx: extractMaskCtx!
  }
}

function drawExtractPoint(canvasX: number, canvasY: number, erase = false) {
  const resources = ensureExtractResources()
  if (!resources) return

  const { layer, img, ctx } = resources
  const props = getLayerProps(layer)
  const centerX = store.project.width / 2 + (props.x ?? 0)
  const centerY = store.project.height / 2 + (props.y ?? 0)
  const scale = props.scale ?? 1

  const localX = (canvasX - centerX) / scale + img.width / 2
  const localY = (canvasY - centerY) / scale + img.height / 2

  const brush = Math.max(1, store.extractMode.brush || 30)

  ctx.beginPath()
  ctx.arc(localX, localY, brush, 0, Math.PI * 2)
  ctx.fillStyle = erase ? 'black' : 'white'
  ctx.fill()

  scheduleRender()
}

function drawExtractOverlay(ctx: CanvasRenderingContext2D) {
  if (!store.extractMode.enabled || !extractMaskCanvas || !extractSourceLayerId) return
  const bgLayer = store.layers.find(l => l.id === extractSourceLayerId)
  if (!bgLayer) return
  const img = getCachedImage(bgLayer)
  if (!img) return

  const props = getLayerProps(bgLayer)
  ctx.save()
  ctx.translate(store.project.width / 2 + (props.x ?? 0), store.project.height / 2 + (props.y ?? 0))
  ctx.rotate((props.rotation ?? 0) * Math.PI / 180)
  ctx.scale(props.scale ?? 1, props.scale ?? 1)
  
  // 1. 先把图片和蒙版位置对齐
  const dx = -img.width / 2
  const dy = -img.height / 2
  
  // 2. 绘制全屏半透明黑层 (表示"未选中/背景")
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)'
  ctx.fillRect(dx, dy, img.width, img.height)

  // 3. 使用 destination-out 擦除黑层 (露出下方高亮原图，表示"选中")
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(extractMaskCanvas, dx, dy, img.width, img.height)
  
  // 4. 可选：给边缘加个红色描边增强可见性 (source-over)
  // ctx.globalCompositeOperation = 'source-over'
  // ... (如果性能允许可以做边缘检测)

  ctx.restore()
}

function clearExtractSelection() {
  if (extractMaskCtx && extractMaskCanvas) {
    extractMaskCtx.clearRect(0, 0, extractMaskCanvas.width, extractMaskCanvas.height)
    scheduleRender()
  }
}

function hasExtractSelection() {
  if (!extractMaskCtx || !extractMaskCanvas) return false
  const data = extractMaskCtx.getImageData(0, 0, extractMaskCanvas.width, extractMaskCanvas.height).data
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 10) return true
  }
  return false
}

// 简单的图像修复/填充算法 (Content-Aware Fill 近似)
function inpaintSimple(ctx: CanvasRenderingContext2D, width: number, height: number) {
  // 1. 获取原始图像 (已有透明洞)
  const original = ctx.canvas
  
  // 2. 创建处理画布
  const tempC = document.createElement('canvas')
  tempC.width = width
  tempC.height = height
  const tCtx = tempC.getContext('2d')
  if (!tCtx) return null

  // 3. 绘制原始图像
  tCtx.drawImage(original, 0, 0)
  
  // 4. 边缘扩散 (简单的膨胀算法)
  // 通过多次绘制并微小偏移，将边缘像素"推"进透明区域
  const steps = 8 // 扩散次数
  tCtx.globalCompositeOperation = 'destination-over' // 在下方绘制，避免覆盖已有像素
  
  for (let i = 0; i < steps; i++) {
    // 上下左右偏移绘制
    tCtx.drawImage(tempC, 1, 0)
    tCtx.drawImage(tempC, -1, 0)
    tCtx.drawImage(tempC, 0, 1)
    tCtx.drawImage(tempC, 0, -1)
    
    // 对角线偏移 (增强填充速度)
    if (i % 2 === 0) {
        tCtx.drawImage(tempC, 1, 1)
        tCtx.drawImage(tempC, -1, -1)
        tCtx.drawImage(tempC, 1, -1)
        tCtx.drawImage(tempC, -1, 1)
    }
  }
  
  // 5. 强力模糊填充 (填补剩余大洞)
  const blurC = document.createElement('canvas')
  blurC.width = width / 8 // 降采样
  blurC.height = height / 8
  const bCtx = blurC.getContext('2d')
  if (bCtx) {
      bCtx.drawImage(tempC, 0, 0, blurC.width, blurC.height)
      bCtx.filter = 'blur(4px)' // 在小图上模糊相当于大图的大模糊
      bCtx.drawImage(blurC, 0, 0)
      bCtx.drawImage(blurC, 0, 0) // 加强颜色
      
      // 将模糊底图画在最下面
      tCtx.save()
      tCtx.globalCompositeOperation = 'destination-over'
      tCtx.filter = 'blur(8px)' // 再次模糊以柔和边缘
      tCtx.drawImage(blurC, 0, 0, width, height)
      tCtx.restore()
  }

  return tempC.toDataURL('image/png')
}

function applyExtractSelection() {
  const resources = ensureExtractResources()
  if (!resources || !extractMaskCanvas || !extractMaskCtx) {
    return { error: '背景图层尚未准备好' }
  }

  if (!hasExtractSelection()) {
    return null
  }

  const { img } = resources
  
  // 1. 生成前景图 (Extract)
  const fgCanvas = document.createElement('canvas')
  fgCanvas.width = img.width
  fgCanvas.height = img.height
  const fgCtx = fgCanvas.getContext('2d')
  if (!fgCtx) return { error: '无法创建临时画布' }

  fgCtx.drawImage(img, 0, 0)
  fgCtx.globalCompositeOperation = 'destination-in'
  fgCtx.drawImage(extractMaskCanvas, 0, 0)
  
  const foregroundDataUrl = fgCanvas.toDataURL('image/png')

  // 2. 生成背景图 (Inpaint)
  const bgCanvas = document.createElement('canvas')
  bgCanvas.width = img.width
  bgCanvas.height = img.height
  const bgCtx = bgCanvas.getContext('2d')
  if (!bgCtx) return { error: '无法创建背景画布' }
  
  // A. 绘制原背景
  bgCtx.drawImage(img, 0, 0)
  
  // B. 挖空 (Destination-Out)
  bgCtx.globalCompositeOperation = 'destination-out'
  bgCtx.drawImage(extractMaskCanvas, 0, 0)
  
  // C. 像素填充 (Inpaint)
  bgCtx.globalCompositeOperation = 'source-over' // 恢复
  const backgroundDataUrl = inpaintSimple(bgCtx, img.width, img.height) || img.src // 失败则回退

  return { 
      foregroundDataUrl,
      backgroundDataUrl 
  }
}

// 路径点击处理
function handlePathClick(coords: { x: number, y: number }, e: MouseEvent) {
  const layer = store.currentLayer
  if (!layer) return
  
  if (!layer.bezierPath) layer.bezierPath = []
  
  // 检查是否点击了现有路径点
  const hitIndex = findPathPointAt(coords)
  
  if (hitIndex >= 0) {
    // 选中路径点进行拖动
    selectedPathPoint = hitIndex
    isPathEditing = true
  } else {
    // 添加新路径点
    const centerX = store.project.width / 2
    const centerY = store.project.height / 2
    
    layer.bezierPath.push({
      x: coords.x - centerX,
      y: coords.y - centerY
    })
    
    if (layer.bezierPath.length >= 2) {
      layer.usePathAnimation = true
    }
    
    scheduleRender()
  }
}

// 查找路径点
function findPathPointAt(coords: { x: number, y: number }): number {
  const layer = store.currentLayer
  if (!layer || !layer.bezierPath) return -1
  
  const centerX = store.project.width / 2
  const centerY = store.project.height / 2
  const hitRadius = 10
  
  for (let i = 0; i < layer.bezierPath.length; i++) {
    const pt = layer.bezierPath[i]
    const dx = (pt.x + centerX) - coords.x
    const dy = (pt.y + centerY) - coords.y
    if (Math.sqrt(dx * dx + dy * dy) < hitRadius) {
      return i
    }
  }
  return -1
}

// 更新路径点
function updatePathPoint(coords: { x: number, y: number }) {
  const layer = store.currentLayer
  if (!layer || !layer.bezierPath || selectedPathPoint < 0) return
  
  const centerX = store.project.width / 2
  const centerY = store.project.height / 2
  
  layer.bezierPath[selectedPathPoint].x = coords.x - centerX
  layer.bezierPath[selectedPathPoint].y = coords.y - centerY
  
  scheduleRender()
}

function onMouseUp() {
  isDragging = false
  isMaskDrawing = false
  isExtractDrawing = false
  isPathEditing = false
  selectedPathPoint = -1
}

function onWheel(e: WheelEvent) {
  if (!store.currentLayer) return
  
  const delta = e.deltaY > 0 ? -0.05 : 0.05
  const layer = store.currentLayer
  
  if (e.shiftKey) {
    // Shift + 滚轮：旋转
    const props = getLayerProps(layer)
    const newRotation = props.rotation + (delta > 0 ? 5 : -5)
    updateLayerWithKeyframes(layer, 'rotation', newRotation)
  } else if (e.altKey) {
    // Alt + 滚轮：调整透明度
    const props = getLayerProps(layer)
    const newOpacity = Math.max(0, Math.min(1, props.opacity + delta))
    updateLayerWithKeyframes(layer, 'opacity', newOpacity)
  } else {
    // 普通滚轮：缩放
    const props = getLayerProps(layer)
    const newScale = Math.max(0.1, Math.min(5, props.scale + delta))
    updateLayerWithKeyframes(layer, 'scale', newScale)
  }
  scheduleRender()
}

function onKeyDown(e: KeyboardEvent) {
  if (!store.currentLayer) return
  
  const step = e.shiftKey ? 10 : 1
  const layer = store.currentLayer
  const props = getLayerProps(layer)
  
  switch (e.key) {
    case 'ArrowLeft':
      updateLayerWithKeyframes(layer, 'x', props.x - step)
      scheduleRender()
      e.preventDefault()
      break
    case 'ArrowRight':
      updateLayerWithKeyframes(layer, 'x', props.x + step)
      scheduleRender()
      e.preventDefault()
      break
    case 'ArrowUp':
      updateLayerWithKeyframes(layer, 'y', props.y - step)
      scheduleRender()
      e.preventDefault()
      break
    case 'ArrowDown':
      updateLayerWithKeyframes(layer, 'y', props.y + step)
      scheduleRender()
      e.preventDefault()
      break
    case 'r':
    case 'R':
      // 重置变换
      updateLayerWithKeyframes(layer, 'x', 0)
      updateLayerWithKeyframes(layer, 'y', 0)
      updateLayerWithKeyframes(layer, 'scale', 1)
      updateLayerWithKeyframes(layer, 'rotation', 0)
      updateLayerWithKeyframes(layer, 'opacity', 1)
      scheduleRender()
      e.preventDefault()
      break
    case 'Delete':
    case 'Backspace':
      if (confirm('删除当前图层?')) {
        store.removeLayer(store.currentLayerIndex)
      }
      e.preventDefault()
      break
  }
}

defineExpose({
  clearExtractSelection,
  applyExtractSelection
})
</script>

<style scoped>
.canvas-preview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
}

canvas {
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
  cursor: move;
  max-width: calc(100% - 20px);
  max-height: calc(100% - 40px);
  outline: none;
  /* GPU 加速 */
  will-change: contents;
  transform: translateZ(0);
  image-rendering: -webkit-optimize-contrast;
}

canvas:focus {
  box-shadow: 0 0 0 2px #3a7bc8, 0 4px 24px rgba(0, 0, 0, 0.5);
}

.canvas-info {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  color: #aaa;
  font-size: 11px;
  padding: 4px 12px;
  border-radius: 4px;
  white-space: nowrap;
}

.gpu-badge {
  background: linear-gradient(135deg, #00b894, #00cec9);
  color: #fff;
  font-size: 9px;
  font-weight: bold;
  padding: 2px 5px;
  border-radius: 3px;
  margin-right: 6px;
}
</style>
