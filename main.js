// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const CONFIG = {
  COLORS: {
    BACKGROUND: 0xffffff,
    WHITE_FILL: 0xffffff,
    BLACK_OUTLINE: 0x000000,
  },
  CAMERA: {
    FOV: 30,
    NEAR: 0.1,
    FAR: 1000,
    Y_POSITION: 0.3,
    Z_DESKTOP: 1,
    Z_MOBILE: 2,
  },
  LIGHTING: {
    DIRECTIONAL_INTENSITY: 1,
    AMBIENT_INTENSITY: 0.3,
  },
  MOBILE_BREAKPOINT: 768,
  EDGE_THRESHOLD_ANGLE: 10,
  OPACITY: {
    VISIBLE: 1,
    HIDDEN: 0,
    THRESHOLD_LOW: 0.01,
    THRESHOLD_HIGH: 0.99,
  },
};

const ANIMATION_CONFIG = {
  DESKTOP: {
    stage0: { duration: 1.2 },
    stage1: { duration: 3.0, zoomAmount: 0.3 },
    stage2: {
      duration: 3.0,
      zoomAmount: 1.1,
      separation: { x: 2.5, z: 1.6 },
      scale: { x: 15.0, y: 7.0 },
      moveDown: 0.4,
    },
    stage3: { moveLeft: 0.5, moveRight: 0.5 },
    stage4: {
      rotateToCenter: 0.9,
      moveBackZ: 2.5,
      moveUpY: 0.7,
      moveBackDuration: 0.9,
      panelMoveInX: 1.35,
      panelMoveInZ: 0.15,
      panelScaleX: 8.0,
      panelScaleY: 4.2,
      panelDuration: 0.9,
    },
    stage5: {
      pauseAfterStage4: 0.1,
      duration: 0.5,
      threeDim: 0.92,
    },
  },
  MOBILE: {
    stage0: { duration: 1.0 },
    stage1: { duration: 1.5, zoomAmount: 0.4 },
    stage2: {
      duration: 2.0,
      zoomAmount: 1.0,
      separation: { x: 1.0, z: 0.3 },
      scale: { x: 4.5, y: 5.5 },
      moveDown: 0.5,
    },
    stage3: { moveLeft: 0.5, moveRight: 0.5 },
    stage4: {
      rotateToCenter: 0.9,
      moveBackZ: 5.5,
      moveUpY: 0.5,
      moveBackDuration: 0.9,
      panelMoveInX: 0.4,
      panelMoveInZ: 0.1,
      panelScaleX: 3.0,
      panelScaleY: 4.0,
      panelDuration: 0.9,
    },
    stage5: {
      pauseAfterStage4: 0.35,
      duration: 1.0,
      threeDim: 0.9,
    },
  },
};

// ============================================================================
// SCENE SETUP
// ============================================================================

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.COLORS.BACKGROUND);

const camera = new THREE.PerspectiveCamera(
  CONFIG.CAMERA.FOV,
  window.innerWidth / window.innerHeight,
  CONFIG.CAMERA.NEAR,
  CONFIG.CAMERA.FAR
);

const renderer = new THREE.WebGLRenderer({
  canvas: document.querySelector('#webgl'),
  antialias: true,
  alpha: true,
  // Retain the last frame when a touch browser composites inertial scrolling.
  preserveDrawingBuffer: window.matchMedia('(any-pointer: coarse)').matches,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(CONFIG.COLORS.BACKGROUND, 1);
let renderedWidth = 0;
let renderedHeight = 0;
let contextLost = false;

function resizeRendererToDisplaySize() {
  const width = Math.max(1, renderer.domElement.clientWidth);
  const height = Math.max(1, renderer.domElement.clientHeight);
  if (width === renderedWidth && height === renderedHeight) return;

  renderedWidth = width;
  renderedHeight = height;
  // CSS owns display dimensions; only allocate a buffer when they really change.
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  contextLost = true;
  renderer.domElement.style.visibility = 'hidden';
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  contextLost = false;
  // Reveal only after renderScene has drawn a complete replacement frame.
  renderScene();
});
// Reserve transition space before the model loads, avoiding a late layout shift.
document.documentElement.classList.toggle(
  'scene-ready', Boolean(window.gsap && window.ScrollTrigger && !reducedMotion.matches)
);

// ============================================================================
// CAMERA CONTROL STATE
// ============================================================================

const cameraLookTarget = { x: 0, y: 0, z: 0 };
const cameraLookControl = {
  enabled: 1,
  lockCenter: 1,
  leftBlend: 0,
  rightBlend: 0,
};

let centerLookPanel = null;
let leftLookPanel = null;
let rightLookPanel = null;

// ============================================================================
// REUSABLE VECTOR/QUATERNION OBJECTS (for performance)
// ============================================================================

const cameraFacingPanels = [];
const _panelWorldPos = new THREE.Vector3();
const _cameraWorldPos = new THREE.Vector3();
const _toCamera = new THREE.Vector3();
const _parentWorldQuat = new THREE.Quaternion();
const _tempWorldPos = new THREE.Vector3();
const _centerWorldPos = new THREE.Vector3();
const _leftWorldPos = new THREE.Vector3();
const _rightWorldPos = new THREE.Vector3();

// ============================================================================
// SCROLL MANAGEMENT
// ============================================================================

const progressBar = document.querySelector('#pageProgressBar');

function updateScrollProgressBar() {
  const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;
  const progress = scrollableHeight > 0 ? window.scrollY / scrollableHeight : 0;
  progressBar.style.transform = `scaleX(${Math.min(Math.max(progress, 0), 1)})`;
}

// Leave scroll restoration, momentum, touch gestures and keyboard navigation native.
window.addEventListener('scroll', updateScrollProgressBar, { passive: true });
window.addEventListener('load', updateScrollProgressBar);
window.addEventListener('pageshow', updateScrollProgressBar);

/**
 * Map the gaps between real content sections onto the background animation.
 * The timeline holds still throughout each section, regardless of its height.
 * Scrolling backward retraces the same path without resetting content.
 */
function bindSceneToDocument(timeline, transitions, sceneObjects) {
  let ranges = [];
  let refreshFrame = null;
  const mobile = window.innerWidth < CONFIG.MOBILE_BREAKPOINT;
  const readingFrames = mobile ? [
    ['middlePanelContent', sceneObjects.panelCenter],
    ['leftPanelContent', sceneObjects.panelLeft],
    ['rightPanelContent', sceneObjects.panelRight],
  ].map(([id, panel]) => {
    const outlines = [];
    panel?.traverse((child) => {
      if (child.isLineSegments) outlines.push(child);
    });
    return { element: document.getElementById(id), panel, outlines, top: 0, bottom: 0 };
  }) : [];

  function updateReadingFrames() {
    for (const frame of readingFrames) {
      // Complete the handoff within the section's empty padding, before text enters.
      const entering = (window.scrollY + window.innerHeight - frame.top) / 32;
      const leaving = (frame.bottom - window.scrollY) / 32;
      const opacity = Math.max(0, Math.min(1, entering, leaving));
      frame.element.style.setProperty('--reading-frame-opacity', opacity);
      for (const outline of frame.outlines) {
        outline.material.opacity = (frame.panel.userData.opacity ?? 1) * (1 - opacity);
      }
    }
  }

  function updateScene() {
    let time = 0;
    for (const range of ranges) {
      if (window.scrollY < range.start) break;
      const progress = Math.min(1, (window.scrollY - range.start) / (range.end - range.start));
      time = range.from + (range.to - range.from) * progress;
      if (progress < 1) break;
    }
    timeline.time(time);
    updateReadingFrames();
    updateScrollProgressBar();
  }

  function measure() {
    let previousTime = 0;
    const sceneHeight = renderer.domElement.clientHeight;
    ranges = transitions.map(({ id, time }) => {
      const element = document.getElementById(id);
      const top = element.getBoundingClientRect().top + window.scrollY;
      const start = top - sceneHeight * 0.25;
      const end = Math.max(start + 1, top + element.offsetHeight - sceneHeight * 0.75);
      const range = { start, end, from: previousTime, to: time };
      previousTime = time;
      return range;
    });
    for (const frame of readingFrames) {
      frame.top = frame.element.getBoundingClientRect().top + window.scrollY;
      frame.bottom = frame.top + frame.element.offsetHeight;
    }
    updateScene();
  }

  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: updateScene,
    onRefresh: measure,
  });

  // Media dimensions, text wrapping and orientation can change section lengths.
  // Observe content, not scroll input; never change the user's scroll position.
  const observer = new ResizeObserver(() => {
    if (refreshFrame !== null) cancelAnimationFrame(refreshFrame);
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = null;
      ScrollTrigger.refresh();
    });
  });
  document.querySelectorAll('.intro-content, .story-section, #stage5Content').forEach((section) => {
    observer.observe(section);
  });
  measure();

  return () => {
    observer.disconnect();
    if (refreshFrame !== null) cancelAnimationFrame(refreshFrame);
    for (const frame of readingFrames) {
      frame.element.style.removeProperty('--reading-frame-opacity');
      for (const outline of frame.outlines) {
        outline.material.opacity = frame.panel.userData.opacity ?? 1;
      }
    }
  };
}

// ============================================================================
// LIGHTING
// ============================================================================

const directionalLight = new THREE.DirectionalLight(
  CONFIG.COLORS.BACKGROUND,
  CONFIG.LIGHTING.DIRECTIONAL_INTENSITY
);
directionalLight.position.set(1, 1, 2);

const ambientLight = new THREE.AmbientLight(
  CONFIG.COLORS.BACKGROUND,
  CONFIG.LIGHTING.AMBIENT_INTENSITY
);

scene.add(directionalLight, ambientLight);

// ============================================================================
// CAMERA POSITIONING
// ============================================================================

/**
 * Sets camera position based on viewport size
 */
function setCameraPosition() {
  const isMobile = window.innerWidth < CONFIG.MOBILE_BREAKPOINT;
  camera.position.z = isMobile ? CONFIG.CAMERA.Z_MOBILE : CONFIG.CAMERA.Z_DESKTOP;
  camera.position.y = CONFIG.CAMERA.Y_POSITION;
}

setCameraPosition();

// ============================================================================
// MODEL LOADING & SETUP
// ============================================================================

/**
 * Applies white fill material with black outline to a mesh
 * @param {THREE.Mesh} mesh - The mesh to apply materials to
 */
function applyWhiteFillWithBlackOutline(mesh) {
  // Set mesh to white fill (same as background)
  mesh.material = new THREE.MeshBasicMaterial({
    color: CONFIG.COLORS.WHITE_FILL,
    side: THREE.DoubleSide,
    // Push fill slightly back so edge lines render cleanly on top
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  // Add black outline using edge geometry
  // Use threshold angle to avoid dense triangle edges that look thicker
  const edges = new THREE.EdgesGeometry(mesh.geometry, CONFIG.EDGE_THRESHOLD_ANGLE);
  const outlineMaterial = new THREE.LineBasicMaterial({
    color: CONFIG.COLORS.BLACK_OUTLINE,
    linewidth: 1,
    toneMapped: false,
  });
  const outlineLines = new THREE.LineSegments(edges, outlineMaterial);
  outlineLines.renderOrder = 1;
  mesh.add(outlineLines);
}

/**
 * Processes the loaded GLTF model
 * @param {Object} gltf - The loaded GLTF object
 */
function processLoadedModel(gltf) {
  const model = gltf.scene;

  // Apply materials to all meshes
  model.traverse((child) => {
    if (child.isMesh) {
      applyWhiteFillWithBlackOutline(child);
    }
  });

  scene.add(model);

  // Get scene objects by name (must match Blender names exactly)
  const sceneObjects = {
    panelLeft: model.getObjectByName('Panel_Left'),
    panelCenter: model.getObjectByName('Panel_Mid'),
    panelRight: model.getObjectByName('Panel_Right'),
    panelWhole: model.getObjectByName('Panel_Whole'),
    desk: model.getObjectByName('Desk'),
    keyboard: model.getObjectByName('Keyboard'),
    mouse: model.getObjectByName('Mouse'),
  };

  // Set initial visibility state
  setObjectOpacity(sceneObjects.panelLeft, CONFIG.OPACITY.HIDDEN, true);
  setObjectOpacity(sceneObjects.panelCenter, CONFIG.OPACITY.HIDDEN, true);
  setObjectOpacity(sceneObjects.panelRight, CONFIG.OPACITY.HIDDEN, true);
  setObjectOpacity(sceneObjects.panelWhole, CONFIG.OPACITY.HIDDEN, true);

  // Configure camera-facing panels
  cameraFacingPanels.length = 0;
  if (sceneObjects.panelLeft) cameraFacingPanels.push(sceneObjects.panelLeft);
  if (sceneObjects.panelCenter) cameraFacingPanels.push(sceneObjects.panelCenter);
  if (sceneObjects.panelRight) cameraFacingPanels.push(sceneObjects.panelRight);

  centerLookPanel = sceneObjects.panelCenter || null;
  leftLookPanel = sceneObjects.panelLeft || null;
  rightLookPanel = sceneObjects.panelRight || null;

  // Start by looking at the center panel when available
  if (sceneObjects.panelCenter) {
    setLookTargetFromObject(cameraLookTarget, sceneObjects.panelCenter);
  }

  gsap.registerPlugin(ScrollTrigger);
  const media = gsap.matchMedia();
  media.add({
    desktop: '(min-width: 768px)',
    mobile: '(max-width: 767px)',
    reduceMotion: '(prefers-reduced-motion: reduce)',
  }, (context) => {
    const animateScene = !context.conditions.reduceMotion;
    document.documentElement.classList.toggle('scene-ready', animateScene);
    if (!animateScene) return;

    setCameraPosition();
    scene.background.setHex(CONFIG.COLORS.BACKGROUND);
    gsap.set(cameraLookControl, { lockCenter: 1, leftBlend: 0, rightBlend: 0 });
    [sceneObjects.panelLeft, sceneObjects.panelCenter, sceneObjects.panelRight, sceneObjects.panelWhole]
      .forEach((panel) => setObjectOpacity(panel, CONFIG.OPACITY.HIDDEN, true));
    const cleanup = initScrollAnimations(sceneObjects);
    return () => {
      cleanup();
      document.documentElement.classList.remove('scene-ready');
    };
  });
}

const loader = new THREE.GLTFLoader();
loader.load('models/scene.glb', processLoadedModel, undefined, () => {
  document.documentElement.classList.remove('scene-ready');
  renderer.domElement.hidden = true;
  updateScrollProgressBar();
});

// ============================================================================
// SCROLL ANIMATIONS
// ============================================================================

/**
 * Adds an opacity tween for a 3D object while keeping material updates centralized.
 * @param {gsap.core.Timeline} timeline - GSAP timeline
 * @param {THREE.Object3D} object3D - Object to animate opacity for
 * @param {number} opacity - Target opacity
 * @param {number} duration - Tween duration
 * @param {number|string} at - Timeline position
 */
function opacityTweenObj(timeline, object3D, opacity, duration, at) {
  if (!object3D) return;

  timeline.to(
    object3D.userData,
    {
      opacity,
      duration,
      onUpdate: () => setObjectOpacity(object3D, object3D.userData.opacity),
    },
    at
  );
}

/**
 * Initializes scroll-based animations for the 3D scene
 * @param {Object} sceneObjects - Object containing references to scene objects
 */
function initScrollAnimations(sceneObjects) {
  gsap.registerPlugin(ScrollTrigger);

  const isMobile = window.innerWidth < CONFIG.MOBILE_BREAKPOINT;
  const config = isMobile ? ANIMATION_CONFIG.MOBILE : ANIMATION_CONFIG.DESKTOP;

  // Calculate camera zoom positions
  const startZ = camera.position.z;
  const stage1Z = startZ + config.stage1.zoomAmount;
  const stage2Z = startZ + config.stage2.zoomAmount;

  // Calculate animation timing
  const stage0Duration = config.stage0.duration;
  const stage1Duration = config.stage1.duration;
  const stage2Duration = config.stage2.duration;
  const timings = {
    stage0Start: 0,
    stage1Start: stage0Duration,
    stage2Start: stage0Duration + stage1Duration,
    stage3Start: stage0Duration + stage1Duration + stage2Duration,
  };

  const timeline = gsap.timeline({ paused: true });

  // Intro: reveal the whole window, then decompose it into spatial panels.
  opacityTweenObj(timeline, sceneObjects.panelWhole, 1, stage0Duration, timings.stage0Start);

  opacityTweenObj(timeline, sceneObjects.panelLeft, 1, stage1Duration, timings.stage1Start);
  opacityTweenObj(timeline, sceneObjects.panelCenter, 1, stage1Duration, timings.stage1Start);
  opacityTweenObj(timeline, sceneObjects.panelRight, 1, stage1Duration, timings.stage1Start);

  // Instantly hide whole panel at stage 2 (reversible on scroll back)
  opacityTweenObj(timeline, sceneObjects.panelWhole, 0, 0.001, timings.stage2Start);

  // Stage 1 & 2: Camera zoom animation
  timeline.to(camera.position, { z: stage1Z, duration: stage1Duration, ease: 'none' }, timings.stage1Start);
  timeline.to(camera.position, { z: stage2Z, duration: stage2Duration, ease: 'none' }, timings.stage2Start);

  // Stage 2: Panels separate and enlarge
  if (sceneObjects.panelLeft) {
    timeline.to(
      sceneObjects.panelLeft.position,
      { x: '-=' + config.stage2.separation.x, duration: stage2Duration, ease: 'none' },
      timings.stage2Start
    );
    timeline.to(
      sceneObjects.panelLeft.scale,
      { x: config.stage2.scale.x, y: config.stage2.scale.y, z: 1.0, duration: stage2Duration, ease: "none" },
      timings.stage2Start
    );
  }
  if (sceneObjects.panelCenter) {
    timeline.to(
      sceneObjects.panelCenter.position,
      { z: '-=' + config.stage2.separation.z, duration: stage2Duration, ease: 'none' },
      timings.stage2Start
    );
    timeline.to(
      sceneObjects.panelCenter.scale,
      { x: config.stage2.scale.x, y: config.stage2.scale.y, z: 1.0, duration: stage2Duration, ease: "none" },
      timings.stage2Start
    );
  }
  if (sceneObjects.panelRight) {
    timeline.to(
      sceneObjects.panelRight.position,
      { x: '+=' + config.stage2.separation.x, duration: stage2Duration, ease: 'none' },
      timings.stage2Start
    );
    timeline.to(
      sceneObjects.panelRight.scale,
      { x: config.stage2.scale.x, y: config.stage2.scale.y, z: 1.0, duration: stage2Duration, ease: "none" },
      timings.stage2Start
    );
  }

  // Stage 2: Move desk objects down
  [sceneObjects.desk, sceneObjects.keyboard, sceneObjects.mouse].forEach((object3D) => {
    if (!object3D) return;
    timeline.to(
      object3D.position,
      { y: '-=' + config.stage2.moveDown, duration: stage2Duration, ease: 'none' },
      timings.stage2Start
    );
  });

  // Stage 3: Camera view rotation (no translation)
  // Unlock camera from center panel
  timeline.to(cameraLookControl, { lockCenter: 0, duration: 0.001 }, timings.stage3Start);
  timeline.set(cameraLookControl, { leftBlend: 0, rightBlend: 0 }, timings.stage3Start);

  // Content is in normal flow. Only rotate during the gaps between sections.
  const leftTransitionEnd = timings.stage3Start + config.stage3.moveLeft;
  timeline.to(cameraLookControl, {
    leftBlend: 1, duration: config.stage3.moveLeft, ease: 'none',
  }, timings.stage3Start);

  const rightTransitionEnd = leftTransitionEnd + config.stage3.moveRight;
  timeline.to(cameraLookControl, {
    rightBlend: 1, duration: config.stage3.moveRight, ease: 'none',
  }, leftTransitionEnd);

  const stage4Start = rightTransitionEnd;

  timeline.to(
    cameraLookControl,
    {
      leftBlend: 0,
      rightBlend: 0,
      duration: config.stage4.rotateToCenter,
      ease: 'none',
    },
    stage4Start
  );
  // Lock to center only after the rotate-back tween finishes so reverse scrub
  // can smoothly interpolate back toward the right panel without snapping.
  timeline.set(cameraLookControl, { lockCenter: 1 }, stage4Start + config.stage4.rotateToCenter);
  timeline.to(
    camera.position,
    {
      z: stage2Z + config.stage4.moveBackZ,
      y: CONFIG.CAMERA.Y_POSITION + config.stage4.moveUpY,
      duration: config.stage4.moveBackDuration,
      ease: 'none',
    },
    stage4Start
  );

  if (sceneObjects.panelLeft) {
    timeline.to(
      sceneObjects.panelLeft.position,
      { x: '+=' + config.stage4.panelMoveInX, duration: config.stage4.panelDuration, ease: 'none' },
      stage4Start
    );
    timeline.to(
      sceneObjects.panelLeft.scale,
      { x: config.stage4.panelScaleX, y: config.stage4.panelScaleY, z: 1.0, duration: config.stage4.panelDuration, ease: 'none' },
      stage4Start
    );
  }

  if (sceneObjects.panelCenter) {
    timeline.to(
      sceneObjects.panelCenter.position,
      { z: '+=' + config.stage4.panelMoveInZ, duration: config.stage4.panelDuration, ease: 'none' },
      stage4Start
    );
    timeline.to(
      sceneObjects.panelCenter.scale,
      { x: config.stage4.panelScaleX, y: config.stage4.panelScaleY, z: 1.0, duration: config.stage4.panelDuration, ease: 'none' },
      stage4Start
    );
  }

  if (sceneObjects.panelRight) {
    timeline.to(
      sceneObjects.panelRight.position,
      { x: '-=' + config.stage4.panelMoveInX, duration: config.stage4.panelDuration, ease: 'none' },
      stage4Start
    );
    timeline.to(
      sceneObjects.panelRight.scale,
      { x: config.stage4.panelScaleX, y: config.stage4.panelScaleY, z: 1.0, duration: config.stage4.panelDuration, ease: 'none' },
      stage4Start
    );
  }

  // Stage 5: Shade the scene background inside WebGL, without a canvas CSS filter.
  const stage4End = stage4Start + Math.max(
    config.stage4.rotateToCenter,
    config.stage4.moveBackDuration,
    config.stage4.panelDuration
  );
  const stage5Start = stage4End + config.stage5.pauseAfterStage4;
  const stage5Dim = { value: 1 };

  timeline.to(
    stage5Dim,
    {
      value: config.stage5.threeDim,
      duration: config.stage5.duration,
      ease: 'none',
      onUpdate: () => {
        scene.background.setScalar(stage5Dim.value);
      },
    },
    stage5Start
  );

  return bindSceneToDocument(timeline, [
    { id: 'introTransition', time: timings.stage3Start },
    { id: 'leftTransition', time: leftTransitionEnd },
    { id: 'rightTransition', time: rightTransitionEnd },
    { id: 'outroTransition', time: timeline.duration() },
  ], sceneObjects);
}

// ============================================================================
// VISIBILITY & OPACITY
// ============================================================================

/**
 * Sets the opacity of a 3D object and all its children
 * @param {THREE.Object3D} object3D - The object to modify
 * @param {number} opacity - Opacity value between 0 and 1
 * @param {boolean} suppressLog - Whether to suppress console logging
 */
function setObjectOpacity(object3D, opacity, suppressLog = false) {
  if (!object3D) return;

  const prevState = object3D.userData.visibilityState;
  let nextState = 'transitioning';

  if (opacity <= CONFIG.OPACITY.THRESHOLD_LOW) nextState = 'hidden';
  if (opacity >= CONFIG.OPACITY.THRESHOLD_HIGH) nextState = 'visible';

  object3D.userData.opacity = opacity;
  object3D.userData.visibilityState = nextState;

  // Log visibility state changes
  if (!suppressLog && prevState !== nextState) {
    const objectName = object3D.name || object3D.uuid;
    if (nextState === 'hidden') {
      console.log(`[visibility] ${objectName} disappeared`);
    }
    if (nextState === 'visible') {
      console.log(`[visibility] ${objectName} reappeared`);
    }
  }

  // Apply opacity to all materials in the object hierarchy
  object3D.traverse((child) => {
    if (!child.material) return;

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material.transparent) {
        material.transparent = true;
        material.needsUpdate = true;
      }
      material.opacity = opacity;
      material.depthWrite = opacity >= 1;
    });
  });
}

// ============================================================================
// RENDER LOOP
// ============================================================================

/**
 * Main animation loop
 */
function animate() {
  requestAnimationFrame(animate);
  renderScene();
}

function renderScene() {
  if (document.hidden || reducedMotion.matches || contextLost) return;
  // Resizing clears a canvas. Resize and redraw in this same frame, never separately.
  resizeRendererToDisplaySize();
  updatePanelsFacingCamera();
  updateCameraLookTarget();

  if (cameraLookControl.enabled > 0.5) {
    camera.lookAt(cameraLookTarget.x, cameraLookTarget.y, cameraLookTarget.z);
  }

  renderer.render(scene, camera);
  if (renderer.domElement.style.visibility === 'hidden') {
    renderer.domElement.style.visibility = 'visible';
  }
}

/**
 * Updates the camera's look target based on current animation state
 */
function updateCameraLookTarget() {
  if (cameraLookControl.lockCenter > 0.5 && centerLookPanel) {
    // Locked to center panel
    setLookTargetFromObject(cameraLookTarget, centerLookPanel);
  } else if (centerLookPanel && leftLookPanel && rightLookPanel) {
    // Stage 3: Deterministic look path (center -> left -> right)
    setLookTargetFromObject(_centerWorldPos, centerLookPanel);
    setLookTargetFromObject(_leftWorldPos, leftLookPanel);
    setLookTargetFromObject(_rightWorldPos, rightLookPanel);

    const leftBlend = THREE.MathUtils.clamp(cameraLookControl.leftBlend, 0, 1);
    const rightBlend = THREE.MathUtils.clamp(cameraLookControl.rightBlend, 0, 1);

    // Interpolate center -> left
    const fromX = _centerWorldPos.x + (_leftWorldPos.x - _centerWorldPos.x) * leftBlend;
    const fromY = _centerWorldPos.y + (_leftWorldPos.y - _centerWorldPos.y) * leftBlend;
    const fromZ = _centerWorldPos.z + (_leftWorldPos.z - _centerWorldPos.z) * leftBlend;

    // Interpolate left -> right
    cameraLookTarget.x = fromX + (_rightWorldPos.x - fromX) * rightBlend;
    cameraLookTarget.y = fromY + (_rightWorldPos.y - fromY) * rightBlend;
    cameraLookTarget.z = fromZ + (_rightWorldPos.z - fromZ) * rightBlend;
  }
}

animate();

// ============================================================================
// CAMERA & PANEL UTILITIES
// ============================================================================

/**
 * Sets the look target to the world position of a 3D object
 * @param {Object} target - Target object with x, y, z properties
 * @param {THREE.Object3D} object3D - The 3D object to get position from
 */
function setLookTargetFromObject(target, object3D) {
  if (!object3D) return;
  object3D.getWorldPosition(_tempWorldPos);
  target.x = _tempWorldPos.x;
  target.y = _tempWorldPos.y;
  target.z = _tempWorldPos.z;
}

/**
 * Updates panels to always face the camera (billboard effect on Y-axis only)
 */
function updatePanelsFacingCamera() {
  if (cameraFacingPanels.length === 0) return;
  camera.getWorldPosition(_cameraWorldPos);

  cameraFacingPanels.forEach((panel) => {
    panel.getWorldPosition(_panelWorldPos);
    _toCamera.subVectors(_cameraWorldPos, _panelWorldPos);
    _toCamera.y = 0; // Only rotate around vertical axis

    if (_toCamera.lengthSq() < 1e-6) return;

    _toCamera.normalize();

    // Account for parent transformations
    if (panel.parent) {
      panel.parent.getWorldQuaternion(_parentWorldQuat);
      _parentWorldQuat.invert();
      _toCamera.applyQuaternion(_parentWorldQuat);
      _toCamera.y = 0;
      if (_toCamera.lengthSq() < 1e-6) return;
      _toCamera.normalize();
    }

    panel.rotation.y = Math.atan2(_toCamera.x, _toCamera.z);
  });
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// The render loop handles actual canvas size changes atomically with drawing.
window.addEventListener('resize', updateScrollProgressBar);
