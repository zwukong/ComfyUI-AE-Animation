import { Ref } from 'vue'

export function useCanvasInteraction(
  store: any,
  canvasRef: Ref<HTMLCanvasElement | undefined>,
  interactionCanvasRef: Ref<HTMLCanvasElement | undefined>,
  scheduleRender: () => void,
  getLayerProps: (layer: any) => any,
  getCachedImage: (layer: any) => HTMLImageElement | null
) {
  let isDragging = false
  let dragStartX = 0
  let dragStartY = 0
  let dragStartLayerX = 0
  let dragStartLayerY = 0
  let shiftKey = false
  let altKey = false

  let isPanoOrbit = false
  let isPanoPan = false
  let panoDragStartX = 0
  let panoDragStartY = 0
  let panoStartYaw = 0
  let panoStartPitch = 0
  let panoStartOffsetX = 0
  let panoStartOffsetY = 0

  let isCameraPan = false
  let cameraDragStartX = 0
  let cameraDragStartY = 0
  let cameraStartPosX = 0
  let cameraStartPosY = 0
  let cameraStartPosZ = 0

  let isMaskDrawing = false
  let maskCtx: CanvasRenderingContext2D | null = null

  let extractMaskCanvas: HTMLCanvasElement | null = null
  let extractMaskCtx: CanvasRenderingContext2D | null = null
  let isExtractDrawing = false
  let extractSourceLayerId: string | null = null

  let isPathEditing = false
  let selectedPathPoint = -1

  function getCanvasCoords(e: MouseEvent) {
    const canvas = interactionCanvasRef.value || canvasRef.value
    if (!canvas) return { x: 0, y: 0 }
    
    const rect = canvas.getBoundingClientRect()
    const scaleX = store.project.width / rect.width
    const scaleY = store.project.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    }
  }

  function updateLayerWithKeyframes(layer: any, prop: string, value: number) {
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

  function onMouseDown(e: MouseEvent) {
    interactionCanvasRef.value?.focus()
    shiftKey = e.shiftKey
    altKey = e.altKey
    
    const coords = getCanvasCoords(e)

    const panoReady = store.project.pano_enable && !store.maskMode.enabled && !store.extractMode.enabled && !store.pathMode.enabled
    if (panoReady) {
      panoDragStartX = coords.x
      panoDragStartY = coords.y
      panoStartYaw = store.project.cam_yaw || 0
      panoStartPitch = store.project.cam_pitch || 0
      panoStartOffsetX = store.project.cam_offset_x || 0
      panoStartOffsetY = store.project.cam_offset_y || 0
      if (e.button === 1 || e.button === 2) {
        isPanoOrbit = true
        return
      } else if (e.button === 0 && (!store.currentLayer || e.altKey)) {
        isPanoPan = true
        return
      }
    }

    const camera3DEnabled = !!(store.project.cam_enable)
    const cameraReady = camera3DEnabled && !store.project.pano_enable && !store.maskMode.enabled && !store.extractMode.enabled && !store.pathMode.enabled
    
    if (cameraReady) {
      cameraDragStartX = coords.x
      cameraDragStartY = coords.y
      cameraStartPosX = store.project.cam_pos_x || 0
      cameraStartPosY = store.project.cam_pos_y || 0
      cameraStartPosZ = store.project.cam_pos_z || 0
      panoStartYaw = store.project.cam_yaw || 0
      panoStartPitch = store.project.cam_pitch || 0
      
      if (e.button === 1 || e.button === 2) {
        isPanoOrbit = true
        return
      }
      
      if (e.button === 0 && !store.currentLayer) {
        isCameraPan = true
        return
      }
    }
    
    if (!store.currentLayer) return
    
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
    
    if (store.maskMode.enabled) {
      isMaskDrawing = true
      initMaskCanvas()
      drawMaskPoint(coords.x, coords.y)
      return
    }
    
    if (store.pathMode.enabled) {
      handlePathClick(coords, e)
      return
    }
    
    isDragging = true
    dragStartX = coords.x
    dragStartY = coords.y
    
    const props = getLayerProps(store.currentLayer)
    dragStartLayerX = props.x
    dragStartLayerY = props.y
  }

  function onMouseMove(e: MouseEvent) {
    const coords = getCanvasCoords(e)

    if (isPanoOrbit) {
      const dx = coords.x - panoDragStartX
      const dy = coords.y - panoDragStartY
      const yaw = panoStartYaw + dx * 0.2
      const pitch = Math.max(-89, Math.min(89, panoStartPitch + dy * 0.2))
      store.setProject({ cam_yaw: yaw, cam_pitch: pitch })
      store.setProjectKeyframe?.('cam_yaw', store.currentTime, yaw)
      store.setProjectKeyframe?.('cam_pitch', store.currentTime, pitch)
      scheduleRender()
      return
    }

    if (isCameraPan) {
      const dx = coords.x - cameraDragStartX
      const dy = coords.y - cameraDragStartY
      const nextX = cameraStartPosX + dx
      const nextY = cameraStartPosY + dy
      store.setProject({ cam_pos_x: nextX, cam_pos_y: nextY })
      store.setProjectKeyframe?.('cam_pos_x', store.currentTime, nextX)
      store.setProjectKeyframe?.('cam_pos_y', store.currentTime, nextY)
      scheduleRender()
      return
    }

    if (isPanoPan) {
      const dx = coords.x - panoDragStartX
      const dy = coords.y - panoDragStartY
      const nextX = (panoStartOffsetX || 0) + dx
      const nextY = (panoStartOffsetY || 0) + dy
      store.setProject({ cam_offset_x: nextX, cam_offset_y: nextY })
      store.setProjectKeyframe?.('cam_offset_x', store.currentTime, nextX)
      store.setProjectKeyframe?.('cam_offset_y', store.currentTime, nextY)
      scheduleRender()
      return
    }

    if (store.extractMode.enabled && isExtractDrawing) {
      drawExtractPoint(coords.x, coords.y, (e.buttons & 2) === 2 || e.altKey)
      return
    }
    
    if (isMaskDrawing && store.maskMode.enabled) {
      drawMaskPoint(coords.x, coords.y)
      return
    }
    
    if (isPathEditing && selectedPathPoint >= 0) {
      updatePathPoint(coords)
      return
    }
    
    if (!isDragging || !store.currentLayer) return
    
    let dx = coords.x - dragStartX
    let dy = coords.y - dragStartY
    
    if (e.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0
      else dx = 0
    }
    
    const newX = dragStartLayerX + dx
    const newY = dragStartLayerY + dy
    
    updateLayerWithKeyframes(store.currentLayer, 'x', newX)
    updateLayerWithKeyframes(store.currentLayer, 'y', newY)
    
    scheduleRender()
  }

  function onMouseUp() {
    isDragging = false
    isMaskDrawing = false
    isExtractDrawing = false
    isPathEditing = false
    selectedPathPoint = -1
    isPanoOrbit = false
    isPanoPan = false
    isCameraPan = false
  }

  function onWheel(e: WheelEvent) {
    const delta = e.deltaY > 0 ? -0.05 : 0.05
    
    const isCameraWheel = store.project.pano_enable &&
      !store.maskMode.enabled && !store.extractMode.enabled && !store.pathMode.enabled &&
      (!store.currentLayer || e.ctrlKey || e.altKey)

    if (isCameraWheel) {
      const nextFov = Math.min(170, Math.max(10, (store.project.cam_fov || 90) + (delta > 0 ? 2 : -2)))
      store.setProject({ cam_fov: nextFov })
      store.setProjectKeyframe?.('cam_fov', store.currentTime, nextFov)
      scheduleRender()
      return
    }

    const camera3DEnabled = !!(store.project.cam_enable)
    const cameraReady = camera3DEnabled && !store.project.pano_enable &&
      !store.maskMode.enabled && !store.extractMode.enabled && !store.pathMode.enabled &&
      !store.currentLayer

    if (cameraReady && !store.currentLayer) {
      const currentZ = store.project.cam_pos_z || 0
      const step = 5
      const nextZ = currentZ + (delta > 0 ? step : -step)
      store.setProject({ cam_pos_z: nextZ })
      store.setProjectKeyframe?.('cam_pos_z', store.currentTime, nextZ)
      scheduleRender()
      return
    }

    if (!store.currentLayer) return

    const layer = store.currentLayer
    const props = getLayerProps(layer)
    const rotationStep = 2
    
    if (e.shiftKey && !e.ctrlKey && !e.altKey) {
      const newRotationX = props.rotationX + (delta > 0 ? rotationStep : -rotationStep)
      updateLayerWithKeyframes(layer, 'rotationX', newRotationX)
    } else if (e.ctrlKey && !e.shiftKey && !e.altKey) {
      const newRotationY = props.rotationY + (delta > 0 ? rotationStep : -rotationStep)
      updateLayerWithKeyframes(layer, 'rotationY', newRotationY)
    } else if (e.altKey && !e.shiftKey && !e.ctrlKey) {
      const newRotationZ = (props.rotationZ || props.rotation || 0) + (delta > 0 ? rotationStep : -rotationStep)
      updateLayerWithKeyframes(layer, 'rotationZ', newRotationZ)
    } else {
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
        if (confirm('Delete current layer?')) {
          store.removeLayer(store.currentLayerIndex)
        }
        e.preventDefault()
        break
    }
  }

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
          const img = new Image()
          img.onload = () => {
            maskCtx?.drawImage(img, 0, 0)
            scheduleRender()
          }
          img.src = layer.customMask
        } else {
          maskCtx.globalCompositeOperation = 'source-over'
          maskCtx.fillStyle = 'white'
          maskCtx.fillRect(0, 0, layer.maskCanvas.width, layer.maskCanvas.height)
        }
      }
    } else {
      maskCtx = layer.maskCanvas.getContext('2d')
    }
  }

  function drawMaskPoint(canvasX: number, canvasY: number) {
    const layer = store.currentLayer
    if (!layer) return

    if (!maskCtx || !layer.maskCanvas) {
      initMaskCanvas()
    }

    if (!layer.img || !maskCtx || !layer.maskCanvas) return
    
    const props = getLayerProps(layer)
    const centerX = store.project.width / 2 + props.x
    const centerY = store.project.height / 2 + props.y
    
    const localX = (canvasX - centerX) / props.scale + layer.img.width / 2
    const localY = (canvasY - centerY) / props.scale + layer.img.height / 2
    
    const brush = store.maskMode.brush || 20
    
    maskCtx.save()
    maskCtx.beginPath()
    maskCtx.arc(localX, localY, brush, 0, Math.PI * 2)
    
    if (!store.maskMode.erase) {
      maskCtx.globalCompositeOperation = 'destination-out'
      maskCtx.fillStyle = 'black'
    } else {
      maskCtx.globalCompositeOperation = 'source-over'
      maskCtx.fillStyle = 'white'
    }
    
    maskCtx.fill()
    maskCtx.restore()
    
    scheduleRender()
  }

  function ensureExtractResources() {
    const bgLayer = store.layers.find((l: any) => l.type === 'background')
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

  function inpaintSimple(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const original = ctx.canvas
    
    const tempC = document.createElement('canvas')
    tempC.width = width
    tempC.height = height
    const tCtx = tempC.getContext('2d')
    if (!tCtx) return null

    tCtx.drawImage(original, 0, 0)
    
    const steps = 20
    tCtx.globalCompositeOperation = 'destination-over'
    
    for (let i = 0; i < steps; i++) {
      tCtx.drawImage(tempC, 1, 0)
      tCtx.drawImage(tempC, -1, 0)
      tCtx.drawImage(tempC, 0, 1)
      tCtx.drawImage(tempC, 0, -1)
      
      if (i % 2 === 0) {
          tCtx.drawImage(tempC, 1, 1)
          tCtx.drawImage(tempC, -1, -1)
          tCtx.drawImage(tempC, 1, -1)
          tCtx.drawImage(tempC, -1, 1)
      }
    }
    for (let i = 0; i < 10; i++) {
      tCtx.drawImage(tempC, 2, 0)
      tCtx.drawImage(tempC, -2, 0)
      tCtx.drawImage(tempC, 0, 2)
      tCtx.drawImage(tempC, 0, -2)
      tCtx.drawImage(tempC, 2, 2)
      tCtx.drawImage(tempC, -2, -2)
      tCtx.drawImage(tempC, 2, -2)
      tCtx.drawImage(tempC, -2, 2)
    }

    return tempC.toDataURL('image/png')
  }

  function applyExtractSelection() {
    const resources = ensureExtractResources()
    if (!resources || !extractMaskCanvas || !extractMaskCtx) {
      return { error: 'Background layer not ready' }
    }

    if (!hasExtractSelection()) {
      return null
    }

    const { img } = resources
    
    const fgCanvas = document.createElement('canvas')
    fgCanvas.width = img.width
    fgCanvas.height = img.height
    const fgCtx = fgCanvas.getContext('2d')
    if (!fgCtx) return { error: 'Cannot create temporary canvas' }

    fgCtx.drawImage(img, 0, 0)
    fgCtx.globalCompositeOperation = 'destination-in'
    fgCtx.drawImage(extractMaskCanvas, 0, 0)
    
    const foregroundDataUrl = fgCanvas.toDataURL('image/png')

    const bgCanvas = document.createElement('canvas')
    bgCanvas.width = img.width
    bgCanvas.height = img.height
    const bgCtx = bgCanvas.getContext('2d')
    if (!bgCtx) return { error: 'Cannot create background canvas' }
    
    bgCtx.drawImage(img, 0, 0)
    
    bgCtx.globalCompositeOperation = 'destination-out'
    bgCtx.drawImage(extractMaskCanvas, 0, 0)
    
    bgCtx.globalCompositeOperation = 'source-over'
    const backgroundDataUrl = inpaintSimple(bgCtx, img.width, img.height) || img.src

    const extractMaskDataUrl = extractMaskCanvas.toDataURL('image/png')
    
    return { 
        foregroundDataUrl,
        backgroundDataUrl,
        extractMaskDataUrl
    }
  }

  function drawExtractOverlayOnCtx(iCtx: CanvasRenderingContext2D) {
    if (!store.extractMode.enabled || !extractMaskCanvas || !extractSourceLayerId) return
    const bgLayer = store.layers.find((l: any) => l.id === extractSourceLayerId)
    if (!bgLayer) return
    const img = getCachedImage(bgLayer)
    if (!img) return

    const props = getLayerProps(bgLayer)
    const canvasW = store.project.width
    const canvasH = store.project.height
    const centerX = canvasW / 2
    const centerY = canvasH / 2
    const imgW = img.width
    const imgH = img.height
    
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
    
    let baseScale = 1
    if (imgW > 0 && imgH > 0) {
      const mode = bgLayer.bg_mode || 'fit'
      if (mode === 'fit') baseScale = Math.min(canvasW / imgW, canvasH / imgH)
      else if (mode === 'fill') baseScale = Math.max(canvasW / imgW, canvasH / imgH)
      else baseScale = Math.min(canvasW / imgW, canvasH / imgH)
    }
    
    const finalX = ((props.x ?? 0) + (camOffsetX + camPosX) * parallax) * camMul
    const finalY = ((props.y ?? 0) + (camOffsetY + camPosY) * parallax) * camMul
    const finalScale = (props.scale ?? 1) * baseScale * camMul * depthMul
    
    iCtx.save()
    iCtx.translate(centerX + finalX, centerY + finalY)
    iCtx.rotate((props.rotation ?? 0) * Math.PI / 180)
    iCtx.scale(finalScale, finalScale)
    
    iCtx.fillStyle = 'rgba(0, 0, 0, 0.65)'
    iCtx.fillRect(-imgW / 2, -imgH / 2, imgW, imgH)

    iCtx.globalCompositeOperation = 'destination-out'
    iCtx.drawImage(extractMaskCanvas, -imgW / 2, -imgH / 2, imgW, imgH)

    iCtx.restore()
  }

  function handlePathClick(coords: { x: number, y: number }, e: MouseEvent) {
    const layer = store.currentLayer
    if (!layer) return
    
    if (!layer.bezierPath) layer.bezierPath = []
    
    const hitIndex = findPathPointAt(coords)
    
    if (hitIndex >= 0) {
      selectedPathPoint = hitIndex
      isPathEditing = true
    } else {
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

  function updatePathPoint(coords: { x: number, y: number }) {
    const layer = store.currentLayer
    if (!layer || !layer.bezierPath || selectedPathPoint < 0) return
    
    const centerX = store.project.width / 2
    const centerY = store.project.height / 2
    
    layer.bezierPath[selectedPathPoint].x = coords.x - centerX
    layer.bezierPath[selectedPathPoint].y = coords.y - centerY
    
    scheduleRender()
  }

  return {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onWheel,
    onKeyDown,
    getCanvasCoords,
    clearExtractSelection,
    applyExtractSelection,
    drawExtractOverlayOnCtx
  }
}
