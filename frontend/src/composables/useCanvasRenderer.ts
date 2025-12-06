import { Ref } from 'vue'

export interface PanoCache {
  key?: string
  mapX?: Float32Array
  mapY?: Float32Array
  srcData?: Uint8ClampedArray
  imgW?: number
  imgH?: number
  canvas?: HTMLCanvasElement
  ctx?: CanvasRenderingContext2D | null
  outW?: number
  outH?: number
}

export function useCanvasRenderer(
  store: any,
  canvasRef: Ref<HTMLCanvasElement | undefined>,
  interactionCanvasRef: Ref<HTMLCanvasElement | undefined>
) {
  let ctx: CanvasRenderingContext2D | null = null
  let interactionCtx: CanvasRenderingContext2D | null = null
  let renderPending = false
  
  const imageCache = new Map<string, HTMLImageElement>()
  const panoCache: PanoCache = {}

  function initContexts() {
    if (canvasRef.value) {
      ctx = canvasRef.value.getContext('2d', { 
        alpha: false,
        desynchronized: true
      })
    }
    if (interactionCanvasRef.value) {
      interactionCtx = interactionCanvasRef.value.getContext('2d', {
        alpha: true
      })
    }
  }

  function scheduleRender() {
    if (renderPending) return
    renderPending = true
    requestAnimationFrame(() => {
      renderPending = false
      render()
    })
  }

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

  function interpolateBezierPath(path: any[], time: number, duration: number): { x: number, y: number } | null {
    if (!path || path.length < 2) return null
    
    const t = time / duration
    const totalPoints = path.length
    const segmentCount = totalPoints - 1
    const currentSegment = Math.min(Math.floor(t * segmentCount), segmentCount - 1)
    const segmentT = (t * segmentCount) - currentSegment
    
    const p0 = path[currentSegment]
    const p1 = path[currentSegment + 1]
    
    if (!p0 || !p1) return null
    
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

  function getLayerProps(layer: any) {
    const time = store.currentTime
    const kf = layer.keyframes || {}
    
    let x = interpolateValue(kf.x, time, layer.x || 0)
    let y = interpolateValue(kf.y, time, layer.y || 0)
    
    if (layer.usePathAnimation && layer.bezierPath && layer.bezierPath.length >= 2) {
      const pathPos = interpolateBezierPath(layer.bezierPath, time, store.project.duration)
      if (pathPos) {
        x = pathPos.x
        y = pathPos.y
      }
    }
    
    return {
      x,
      y,
      z: interpolateValue(kf.z, time, layer.z || 0),
      scale: interpolateValue(kf.scale, time, layer.scale || 1),
      rotation: interpolateValue(kf.rotation, time, layer.rotation || 0),
      opacity: interpolateValue(kf.opacity, time, layer.opacity ?? 1),
      mask_size: interpolateValue(kf.mask_size, time, layer.mask_size || 0),
      rotationX: interpolateValue(kf.rotationX, time, layer.rotationX || 0),
      rotationY: interpolateValue(kf.rotationY, time, layer.rotationY || 0),
      rotationZ: interpolateValue(kf.rotationZ, time, layer.rotationZ || 0),
      anchorX: interpolateValue(kf.anchorX, time, layer.anchorX || 0),
      anchorY: interpolateValue(kf.anchorY, time, layer.anchorY || 0),
      perspective: interpolateValue(kf.perspective, time, layer.perspective || 1000)
    }
  }

  function render() {
    renderCanvas2D()
    renderInteractionLayer()
  }

  function renderCanvas2D() {
    if (!canvasRef.value || !ctx) return
    
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, store.project.width, store.project.height)

    const cameraEnabled = !!store.project.cam_enable
    const baseCamOffsetX = store.interpolateProjectValue?.('cam_offset_x', store.currentTime, store.project.cam_offset_x || 0) ?? (store.project.cam_offset_x || 0)
    const baseCamOffsetY = store.interpolateProjectValue?.('cam_offset_y', store.currentTime, store.project.cam_offset_y || 0) ?? (store.project.cam_offset_y || 0)
    const camPosX = store.interpolateProjectValue?.('cam_pos_x', store.currentTime, store.project.cam_pos_x || 0) ?? (store.project.cam_pos_x || 0)
    const camPosY = store.interpolateProjectValue?.('cam_pos_y', store.currentTime, store.project.cam_pos_y || 0) ?? (store.project.cam_pos_y || 0)
    const camPosZ = store.interpolateProjectValue?.('cam_pos_z', store.currentTime, store.project.cam_pos_z || 0) ?? (store.project.cam_pos_z || 0)

    const cameraScale = cameraEnabled ? Math.max(0.2, Math.min(4, 1 / (1 + camPosZ * 0.001))) : 1
    const camOffsetX = cameraEnabled ? baseCamOffsetX + camPosX : baseCamOffsetX
    const camOffsetY = cameraEnabled ? baseCamOffsetY + camPosY : baseCamOffsetY

    const bgLayer = store.layers.find((l: any) => l.type === 'background')
    if (bgLayer && ctx) {
      drawBackgroundLayer(ctx, bgLayer, camOffsetX, camOffsetY, cameraScale, cameraEnabled)
    }

    if (ctx) {
      store.layers.filter((l: any) => l.type !== 'background').forEach((layer: any) => {
        drawForegroundLayer(ctx!, layer, camOffsetX, camOffsetY, cameraEnabled, cameraScale)
      })
    }
    
    if (store.pathMode.enabled && store.currentLayer?.bezierPath && ctx) {
      drawBezierPath(ctx, store.currentLayer.bezierPath)
    }

    if (store.extractMode.enabled && ctx) {
      drawExtractOverlay(ctx)
    }
  }

  let drawExtractOverlayOnCtxFn: ((iCtx: CanvasRenderingContext2D) => void) | null = null

  function setDrawExtractOverlayOnCtx(fn: (iCtx: CanvasRenderingContext2D) => void) {
    drawExtractOverlayOnCtxFn = fn
  }

  function renderInteractionLayer() {
    if (!interactionCanvasRef.value || !interactionCtx) return
    
    const iCtx = interactionCtx
    const w = store.project.width
    const h = store.project.height
    
    iCtx.clearRect(0, 0, w, h)
    
    if (store.pathMode.enabled && store.currentLayer?.bezierPath) {
      drawBezierPathOnCtx(iCtx, store.currentLayer.bezierPath)
    }
    
    if (store.extractMode.enabled && drawExtractOverlayOnCtxFn) {
      drawExtractOverlayOnCtxFn(iCtx)
    }
    
    if (store.maskMode.enabled && store.currentLayer?.maskCanvas) {
      drawMaskOverlayOnCtx(iCtx)
    }
    
    if (store.currentLayer && store.currentLayer.img) {
      drawSelectionBorder(iCtx)
    }
  }

  function ensureMaskCanvas(layer: any, imgW: number, imgH: number) {
    if (layer.maskCanvas || !layer.customMask) return

    const maskImg = new Image()
    maskImg.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = maskImg.width || imgW
      canvas.height = maskImg.height || imgH
      const mCtx = canvas.getContext('2d')
      if (mCtx) {
        mCtx.drawImage(maskImg, 0, 0, canvas.width, canvas.height)
        layer.maskCanvas = canvas
        scheduleRender()
      }
    }
    maskImg.src = layer.customMask
  }

  function drawBackgroundLayer(ctx: CanvasRenderingContext2D, layer: any, camOffsetX = 0, camOffsetY = 0, cameraScale = 1, cameraActive = false) {
    const img = getCachedImage(layer)
    if (!img || img.width === 0 || img.height === 0) return

    const props = getLayerProps(layer)
    const panoEnabled = store.project.pano_enable

    ctx.save()
    ctx.globalAlpha = props.opacity

    const mode = layer.bg_mode || 'fit'
    const canvasW = store.project.width
    const canvasH = store.project.height
    const imgW = img.width
    const imgH = img.height
    let baseScale = 1
    const isPanoCompatible = panoEnabled && imgW > 0 && imgH > 0 && Math.abs(imgW / imgH - 2.0) < 0.35

    if (isPanoCompatible) {
      const yaw = store.interpolateProjectValue?.('cam_yaw', store.currentTime, store.project.cam_yaw || 0) ?? (store.project.cam_yaw || 0)
      const pitch = store.interpolateProjectValue?.('cam_pitch', store.currentTime, store.project.cam_pitch || 0) ?? (store.project.cam_pitch || 0)
      const roll = store.interpolateProjectValue?.('cam_roll', store.currentTime, store.project.cam_roll || 0) ?? (store.project.cam_roll || 0)
      const fov = Math.min(170, Math.max(10, store.interpolateProjectValue?.('cam_fov', store.currentTime, store.project.cam_fov || 90) ?? (store.project.cam_fov || 90)))
      const deg2rad = Math.PI / 180
      const maxPreview = 1024
      let prevW = canvasW
      let prevH = canvasH
      const scaleDown = Math.max(1, Math.max(canvasW, canvasH) / maxPreview)
      if (scaleDown > 1.01) {
        prevW = Math.max(1, Math.round(canvasW / scaleDown))
        prevH = Math.max(1, Math.round(canvasH / scaleDown))
      }

      const key = `${prevW}x${prevH}|${imgW}x${imgH}|${yaw}|${pitch}|${roll}|${fov}`
      const needRebuild = panoCache.key !== key

      if (needRebuild) {
        const srcCanvas = document.createElement('canvas')
        srcCanvas.width = imgW
        srcCanvas.height = imgH
        const sctx = srcCanvas.getContext('2d')
        if (sctx) {
          sctx.drawImage(img, 0, 0, imgW, imgH)
          panoCache.srcData = sctx.getImageData(0, 0, imgW, imgH).data
        } else {
          panoCache.srcData = undefined
        }

        const aspect = canvasW / Math.max(1, canvasH)
        const tanHalfFov = Math.tan((fov * deg2rad) / 2)
        const cy = Math.cos(yaw * deg2rad), sy = Math.sin(yaw * deg2rad)
        const cp = Math.cos(pitch * deg2rad), sp = Math.sin(pitch * deg2rad)
        const cr = Math.cos(roll * deg2rad), sr = Math.sin(roll * deg2rad)
        const R = [
          cr * cy + sr * sp * sy,  sr * cp,  cr * -sy + sr * sp * cy,
          -sr * cy + cr * sp * sy, cr * cp,  -sr * -sy + cr * sp * cy,
          cp * sy,                -sp,       cp * cy
        ]

        const mapX = new Float32Array(prevW * prevH)
        const mapY = new Float32Array(prevW * prevH)
        for (let yPix = 0; yPix < prevH; yPix++) {
          const ny = (yPix + 0.5) / prevH * 2 - 1
          for (let xPix = 0; xPix < prevW; xPix++) {
            const nx = (xPix + 0.5) / prevW * 2 - 1
            let vx = nx * tanHalfFov * aspect
            let vy = -ny * tanHalfFov
            let vz = 1
            const invLen = 1 / Math.hypot(vx, vy, vz)
            vx *= invLen; vy *= invLen; vz *= invLen
            const rx = R[0] * vx + R[1] * vy + R[2] * vz
            const ry = R[3] * vx + R[4] * vy + R[5] * vz
            const rz = R[6] * vx + R[7] * vy + R[8] * vz
            const lon = Math.atan2(rx, rz)
            const lat = Math.asin(Math.max(-1, Math.min(1, ry)))
            const u = ((lon / (Math.PI * 2)) + 0.5) * imgW
            const v = ((-lat / Math.PI) + 0.5) * imgH
            let ui = Math.floor(u) % imgW; if (ui < 0) ui += imgW
            let vi = Math.floor(v); vi = Math.max(0, Math.min(imgH - 1, vi))
            const idx = yPix * prevW + xPix
            mapX[idx] = ui
            mapY[idx] = vi
          }
        }
        panoCache.key = key
        panoCache.mapX = mapX
        panoCache.mapY = mapY
        panoCache.imgW = imgW
        panoCache.imgH = imgH
        panoCache.outW = prevW
        panoCache.outH = prevH

        panoCache.canvas = document.createElement('canvas')
        panoCache.canvas.width = prevW
        panoCache.canvas.height = prevH
        panoCache.ctx = panoCache.canvas.getContext('2d')
      }

      const srcData = panoCache.srcData
      const mapX = panoCache.mapX
      const mapY = panoCache.mapY
      const pCanvas = panoCache.canvas
      const pCtx = panoCache.ctx
      const outW = panoCache.outW || 0
      const outH = panoCache.outH || 0
      if (srcData && mapX && mapY && pCanvas && pCtx && outW > 0 && outH > 0) {
        const dstImage = pCtx.getImageData(0, 0, outW, outH)
        const data = dstImage.data
        const len = outW * outH
        for (let idx = 0; idx < len; idx++) {
          const ui = mapX[idx]
          const vi = mapY[idx]
          const si = (vi * imgW + ui) * 4
          const di = idx * 4
          data[di] = srcData[si]
          data[di + 1] = srcData[si + 1]
          data[di + 2] = srcData[si + 2]
          data[di + 3] = 255
        }
        pCtx.putImageData(dstImage, 0, 0)
        ctx.translate(canvasW / 2 + camOffsetX * cameraScale, canvasH / 2 + camOffsetY * cameraScale)
        ctx.scale(cameraScale, cameraScale)
        ctx.drawImage(pCanvas, -canvasW / 2, -canvasH / 2, canvasW, canvasH)
      } else {
        ctx.restore()
        return drawBackgroundLayer(ctx, { ...layer, panoFallback: true, type: layer.type, bg_mode: layer.bg_mode }, camOffsetX, camOffsetY, cameraScale, cameraActive)
      }
    } else {
      if (imgW > 0 && imgH > 0) {
        if (mode === 'fit') {
          baseScale = Math.min(canvasW / imgW, canvasH / imgH)
        } else if (mode === 'fill') {
          baseScale = Math.max(canvasW / imgW, canvasH / imgH)
        } else if (mode === 'stretch') {
          baseScale = Math.min(canvasW / imgW, canvasH / imgH)
        }
      }

      if (!Number.isFinite(baseScale) || baseScale <= 0) baseScale = 1

      const camYaw = cameraActive ? (store.interpolateProjectValue?.('cam_yaw', store.currentTime, store.project.cam_yaw || 0) ?? (store.project.cam_yaw || 0)) : 0
      const camPitch = cameraActive ? (store.interpolateProjectValue?.('cam_pitch', store.currentTime, store.project.cam_pitch || 0) ?? (store.project.cam_pitch || 0)) : 0
      
      const depthMul = 1 / Math.max(0.1, 1 + (props.z || 0) * 0.001)
      const camMul = cameraActive ? cameraScale : 1
      const camX = cameraActive ? camOffsetX : 0
      const camY = cameraActive ? camOffsetY : 0
      const parallax = cameraActive ? depthMul : 1
      
      let bgX = props.x
      let bgY = props.y
      if (cameraActive && (camYaw !== 0 || camPitch !== 0)) {
        const yawRad = camYaw * Math.PI / 180
        const pitchRad = camPitch * Math.PI / 180
        const bgZ = props.z || 0
        bgX -= Math.tan(yawRad) * (bgZ + 1000) * 0.3
        bgY -= Math.tan(pitchRad) * (bgZ + 1000) * 0.3
      }
      
      const translateX = canvasW / 2 + (bgX + camX * parallax) * camMul
      const translateY = canvasH / 2 + (bgY + camY * parallax) * camMul
      const finalScale = (props.scale || 1) * baseScale * camMul * depthMul
      
      if (!Number.isFinite(translateX) || !Number.isFinite(translateY) || !Number.isFinite(finalScale) || finalScale <= 0) {
        ctx.restore()
        return
      }
      
      ctx.translate(translateX, translateY)
      ctx.rotate(((props.rotation || 0) * Math.PI) / 180)
      ctx.scale(finalScale, finalScale)

      ctx.drawImage(img, -imgW / 2, -imgH / 2, imgW, imgH)
    }
    ctx.restore()
  }

  function drawForegroundLayer(ctx: CanvasRenderingContext2D, layer: any, camOffsetX = 0, camOffsetY = 0, cameraActive = false, cameraScale = 1) {
    const img = getCachedImage(layer)
    if (!img || img.width === 0 || img.height === 0) return

    const props = getLayerProps(layer)
    const w = img.width
    const h = img.height

    ensureMaskCanvas(layer, w, h)

    ctx.save()
    
    const camYaw = cameraActive ? (store.interpolateProjectValue?.('cam_yaw', store.currentTime, store.project.cam_yaw || 0) ?? (store.project.cam_yaw || 0)) : 0
    const camPitch = cameraActive ? (store.interpolateProjectValue?.('cam_pitch', store.currentTime, store.project.cam_pitch || 0) ?? (store.project.cam_pitch || 0)) : 0
    
    const depthMul = 1 / Math.max(0.1, 1 + (props.z || 0) * 0.001)
    const camMul = cameraActive ? cameraScale : 1
    const camX = cameraActive ? camOffsetX : 0
    const camY = cameraActive ? camOffsetY : 0
    const parallax = cameraActive ? depthMul : 1
    
    let layerX = props.x
    let layerY = props.y
    if (cameraActive && (camYaw !== 0 || camPitch !== 0)) {
      const yawRad = camYaw * Math.PI / 180
      const pitchRad = camPitch * Math.PI / 180
      const layerZ = props.z || 0
      layerX -= Math.tan(yawRad) * (layerZ + 500) * 0.5
      layerY -= Math.tan(pitchRad) * (layerZ + 500) * 0.5
    }
    
    const translateX = store.project.width / 2 + (layerX + camX * parallax) * camMul
    const translateY = store.project.height / 2 + (layerY + camY * parallax) * camMul
    
    if (!Number.isFinite(translateX) || !Number.isFinite(translateY)) {
      ctx.restore()
      return
    }
    
    ctx.translate(translateX, translateY)
    
    if (props.rotationX !== 0 || props.rotationY !== 0) {
      const perspective = props.perspective || 1000
      const rx = props.rotationX * Math.PI / 180
      const ry = props.rotationY * Math.PI / 180
      
      const cosX = Math.cos(rx)
      const sinX = Math.sin(rx)
      const cosY = Math.cos(ry)
      const sinY = Math.sin(ry)
      
      const zScale = 1 / (1 + (sinY * w / 2 + sinX * h / 2) / perspective)
      
      ctx.transform(
        cosY * zScale, sinX * sinY * zScale,
        0, cosX * zScale,
        0, 0
      )
    }
    
    ctx.rotate((props.rotation * Math.PI) / 180)
    const scaleApplied = props.scale * camMul * depthMul
    ctx.scale(scaleApplied, scaleApplied)
    ctx.globalAlpha = props.opacity

    const anchorOffsetX = (props.anchorX || 0) * w
    const anchorOffsetY = (props.anchorY || 0) * h

    if (layer.maskCanvas) {
      const offscreen = document.createElement('canvas')
      offscreen.width = w
      offscreen.height = h
      const offCtx = offscreen.getContext('2d')

      if (offCtx) {
        offCtx.clearRect(0, 0, w, h)
        offCtx.drawImage(img, 0, 0, w, h)
        offCtx.globalCompositeOperation = 'destination-in'
        offCtx.drawImage(layer.maskCanvas, 0, 0, w, h)
        ctx.drawImage(
          offscreen,
          -w / 2 - anchorOffsetX,
          -h / 2 - anchorOffsetY,
          w,
          h
        )
      } else {
        ctx.drawImage(img, -w / 2 - anchorOffsetX, -h / 2 - anchorOffsetY, w, h)
      }
    } else {
      ctx.drawImage(img, -w / 2 - anchorOffsetX, -h / 2 - anchorOffsetY, w, h)
    }

    if (props.mask_size > 0) {
      ctx.strokeStyle = '#3ac88e'
      ctx.lineWidth = 2 / props.scale
      ctx.setLineDash([5 / props.scale, 5 / props.scale])
      const maskW = w * props.mask_size
      const maskH = h * props.mask_size
      ctx.strokeRect(-maskW / 2, -maskH / 2, maskW, maskH)
      ctx.setLineDash([])
    }

    ctx.restore()
  }

  function drawBezierPath(ctx: CanvasRenderingContext2D, path: any[]) {
    if (!path || path.length === 0) return
    
    const centerX = store.project.width / 2
    const centerY = store.project.height / 2
    
    ctx.save()
    ctx.strokeStyle = '#ff6b6b'
    ctx.lineWidth = 2
    ctx.setLineDash([5, 5])
    
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
    
    path.forEach((pt, i) => {
      ctx.beginPath()
      ctx.arc(centerX + pt.x, centerY + pt.y, 6, 0, Math.PI * 2)
      ctx.fillStyle = i === 0 ? '#4ecdc4' : (i === path.length - 1 ? '#ff6b6b' : '#ffe66d')
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    })

    if (path.length >= 2) {
      const lastIndex = path.length - 1
      const p0 = path[lastIndex - 1]
      const p1 = path[lastIndex]

      const cp1x = p0.cp2x ?? (p0.x + (p1.x - p0.x) / 3)
      const cp1y = p0.cp2y ?? (p0.y + (p1.y - p0.y) / 3)
      const cp2x = p1.cp1x ?? (p0.x + (p1.x - p0.x) * 2 / 3)
      const cp2y = p1.cp1y ?? (p0.y + (p1.y - p0.y) * 2 / 3)
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

  function drawExtractOverlay(ctx: CanvasRenderingContext2D) {
    // Extract overlay is drawn on interaction canvas, not main canvas
    // This function is kept for compatibility but does nothing
  }

  function drawBezierPathOnCtx(iCtx: CanvasRenderingContext2D, path: any[]) {
    if (!path || path.length === 0) return
    
    const centerX = store.project.width / 2
    const centerY = store.project.height / 2
    
    iCtx.save()
    iCtx.strokeStyle = '#ff6b6b'
    iCtx.lineWidth = 2
    iCtx.setLineDash([5, 5])
    
    iCtx.beginPath()
    iCtx.moveTo(centerX + path[0].x, centerY + path[0].y)
    
    for (let i = 1; i < path.length; i++) {
      const p0 = path[i - 1]
      const p1 = path[i]
      
      const cp1x = p0.cp2x ?? (p0.x + (p1.x - p0.x) / 3)
      const cp1y = p0.cp2y ?? (p0.y + (p1.y - p0.y) / 3)
      const cp2x = p1.cp1x ?? (p0.x + (p1.x - p0.x) * 2 / 3)
      const cp2y = p1.cp1y ?? (p0.y + (p1.y - p0.y) * 2 / 3)
      
      iCtx.bezierCurveTo(
        centerX + cp1x, centerY + cp1y,
        centerX + cp2x, centerY + cp2y,
        centerX + p1.x, centerY + p1.y
      )
    }
    iCtx.stroke()
    iCtx.setLineDash([])
    
    path.forEach((pt, i) => {
      iCtx.beginPath()
      iCtx.arc(centerX + pt.x, centerY + pt.y, 6, 0, Math.PI * 2)
      iCtx.fillStyle = i === 0 ? '#4ecdc4' : (i === path.length - 1 ? '#ff6b6b' : '#ffe66d')
      iCtx.fill()
      iCtx.strokeStyle = '#fff'
      iCtx.lineWidth = 2
      iCtx.stroke()
    })
    
    iCtx.restore()
  }

  function drawExtractOverlayOnCtx(iCtx: CanvasRenderingContext2D) {
    // This is now handled by interaction composable
    // Kept here for compatibility
  }

  function drawMaskOverlayOnCtx(iCtx: CanvasRenderingContext2D) {
    const layer = store.currentLayer
    if (!layer || !layer.maskCanvas || !layer.img) return
    
    const props = getLayerProps(layer)
    const imgW = layer.img.width
    const imgH = layer.img.height
    const canvasW = store.project.width
    const canvasH = store.project.height
    const centerX = canvasW / 2
    const centerY = canvasH / 2
    
    const cameraEnabled = !!store.project.cam_enable
    const camPosX = cameraEnabled ? (store.interpolateProjectValue?.('cam_pos_x', store.currentTime, store.project.cam_pos_x || 0) ?? (store.project.cam_pos_x || 0)) : 0
    const camPosY = cameraEnabled ? (store.interpolateProjectValue?.('cam_pos_y', store.currentTime, store.project.cam_pos_y || 0) ?? (store.project.cam_pos_y || 0)) : 0
    const camPosZ = cameraEnabled ? (store.interpolateProjectValue?.('cam_pos_z', store.currentTime, store.project.cam_pos_z || 0) ?? (store.project.cam_pos_z || 0)) : 0
    const camOffsetX = store.interpolateProjectValue?.('cam_offset_x', store.currentTime, store.project.cam_offset_x || 0) ?? (store.project.cam_offset_x || 0)
    const camOffsetY = store.interpolateProjectValue?.('cam_offset_y', store.currentTime, store.project.cam_offset_y || 0) ?? (store.project.cam_offset_y || 0)
    
    const cameraScale = cameraEnabled ? Math.max(0.2, Math.min(4, 1 / (1 + camPosZ * 0.001))) : 1
    const layerZ = props.z || 0
    const depthMul = 1 / Math.max(0.1, 1 + layerZ * 0.001)
    const parallax = cameraEnabled ? depthMul : 1
    const camMul = cameraEnabled ? cameraScale : 1
    
    const finalX = (props.x + (camOffsetX + camPosX) * parallax) * camMul
    const finalY = (props.y + (camOffsetY + camPosY) * parallax) * camMul
    const finalScale = props.scale * camMul * depthMul
    
    iCtx.save()
    iCtx.globalAlpha = 0.5
    iCtx.translate(centerX + finalX, centerY + finalY)
    
    const actualRotation = props.rotationZ !== undefined && props.rotationZ !== 0 ? props.rotationZ : props.rotation
    iCtx.rotate((actualRotation * Math.PI) / 180)
    iCtx.scale(finalScale, finalScale)
    
    iCtx.fillStyle = 'rgba(255, 0, 0, 0.3)'
    iCtx.fillRect(-imgW / 2, -imgH / 2, imgW, imgH)
    
    iCtx.globalCompositeOperation = 'destination-out'
    iCtx.drawImage(layer.maskCanvas, -imgW / 2, -imgH / 2, imgW, imgH)
    
    iCtx.restore()
  }

  function drawSelectionBorder(iCtx: CanvasRenderingContext2D) {
    const layer = store.currentLayer
    if (!layer || !layer.img) return
    
    const props = getLayerProps(layer)
    const imgW = layer.img.width
    const imgH = layer.img.height
    const canvasW = store.project.width
    const canvasH = store.project.height
    const centerX = canvasW / 2
    const centerY = canvasH / 2
    
    const cameraEnabled = !!store.project.cam_enable
    const baseCamOffsetX = store.interpolateProjectValue?.('cam_offset_x', store.currentTime, store.project.cam_offset_x || 0) ?? (store.project.cam_offset_x || 0)
    const baseCamOffsetY = store.interpolateProjectValue?.('cam_offset_y', store.currentTime, store.project.cam_offset_y || 0) ?? (store.project.cam_offset_y || 0)
    const camPosX = cameraEnabled ? (store.interpolateProjectValue?.('cam_pos_x', store.currentTime, store.project.cam_pos_x || 0) ?? (store.project.cam_pos_x || 0)) : 0
    const camPosY = cameraEnabled ? (store.interpolateProjectValue?.('cam_pos_y', store.currentTime, store.project.cam_pos_y || 0) ?? (store.project.cam_pos_y || 0)) : 0
    const camPosZ = cameraEnabled ? (store.interpolateProjectValue?.('cam_pos_z', store.currentTime, store.project.cam_pos_z || 0) ?? (store.project.cam_pos_z || 0)) : 0
    const camYaw = cameraEnabled ? (store.interpolateProjectValue?.('cam_yaw', store.currentTime, store.project.cam_yaw || 0) ?? (store.project.cam_yaw || 0)) : 0
    const camPitch = cameraEnabled ? (store.interpolateProjectValue?.('cam_pitch', store.currentTime, store.project.cam_pitch || 0) ?? (store.project.cam_pitch || 0)) : 0
    
    const cameraScale = cameraEnabled ? Math.max(0.2, Math.min(4, 1 / (1 + camPosZ * 0.001))) : 1
    const camOffsetX = cameraEnabled ? baseCamOffsetX + camPosX : baseCamOffsetX
    const camOffsetY = cameraEnabled ? baseCamOffsetY + camPosY : baseCamOffsetY
    
    const layerZ = props.z || 0
    const depthMul = 1 / Math.max(0.1, 1 + layerZ * 0.001)
    const parallax = cameraEnabled ? depthMul : 1
    const camMul = cameraEnabled ? cameraScale : 1
    
    let layerX = props.x
    let layerY = props.y
    if (cameraEnabled && (camYaw !== 0 || camPitch !== 0)) {
      const yawRad = camYaw * Math.PI / 180
      const pitchRad = camPitch * Math.PI / 180
      const zOffset = layer.type === 'background' ? (layerZ + 1000) * 0.3 : (layerZ + 500) * 0.5
      layerX -= Math.tan(yawRad) * zOffset
      layerY -= Math.tan(pitchRad) * zOffset
    }
    
    let finalX = (layerX + camOffsetX * parallax) * camMul
    let finalY = (layerY + camOffsetY * parallax) * camMul
    let finalScale = props.scale * camMul * depthMul
    
    if (layer.type === 'background' && imgW > 0 && imgH > 0) {
      const mode = layer.bg_mode || 'fit'
      let baseScale = 1
      if (mode === 'fit') baseScale = Math.min(canvasW / imgW, canvasH / imgH)
      else if (mode === 'fill') baseScale = Math.max(canvasW / imgW, canvasH / imgH)
      else baseScale = Math.min(canvasW / imgW, canvasH / imgH)
      finalScale = props.scale * baseScale * camMul * depthMul
    }
    
    if (!Number.isFinite(finalScale) || finalScale <= 0) finalScale = 1
    
    iCtx.save()
    iCtx.translate(centerX + finalX, centerY + finalY)
    
    const actualRotation = props.rotationZ !== undefined && props.rotationZ !== 0 ? props.rotationZ : props.rotation
    iCtx.rotate((actualRotation * Math.PI) / 180)
    iCtx.scale(finalScale, finalScale)
    
    iCtx.strokeStyle = '#3a7bc8'
    iCtx.lineWidth = 2 / finalScale
    iCtx.strokeRect(-imgW / 2, -imgH / 2, imgW, imgH)
    
    iCtx.fillStyle = '#3a7bc8'
    const corners = [[-imgW/2, -imgH/2], [imgW/2, -imgH/2], [imgW/2, imgH/2], [-imgW/2, imgH/2]]
    corners.forEach(([cx, cy]) => {
      iCtx.fillRect(cx - 4/finalScale, cy - 4/finalScale, 8/finalScale, 8/finalScale)
    })
    
    iCtx.restore()
  }

  function cleanup() {
    imageCache.clear()
  }

  return {
    initContexts,
    scheduleRender,
    render,
    getCachedImage,
    getLayerProps,
    setDrawExtractOverlayOnCtx,
    cleanup,
    panoCache,
    imageCache
  }
}
