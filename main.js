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
    Y_POSITION: 0.2,
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
    stage1: { duration: 1.0, zoomAmount: 0.3 },
    stage2: {
      duration: 3.0,
      zoomAmount: 1.1,
      separation: { x: 1.5, z: 0.6 },
      scale: { x: 10.0, y: 5.0 },
      moveDown: 0.4,
    },
    stage3: { pauseA: 1.2, moveLeft: 0.7, pauseB: 1.0, moveRight: 0.95, pauseC: 1.0 },
    stage4: {
      rotateToCenter: 0.9,
      moveBackZ: 2.5,
      moveUpY: 0.7,
      moveBackDuration: 0.9,
      panelMoveInX: 0.35,
      panelMoveInZ: 0.15,
      panelScaleX: 8.0,
      panelScaleY: 4.2,
      panelDuration: 0.9,
    },
    stage5: {
      pauseAfterStage4: 0.4,
      duration: 1.0,
      threeDim: 0.92,
      contentFade: 0.8,
    },
  },
  MOBILE: {
    stage1: { duration: 1.0, zoomAmount: 0.4 },
    stage2: {
      duration: 3.0,
      zoomAmount: 1.0,
      separation: { x: 1.0, z: 0.3 },
      scale: { x: 4.0, y: 5.5 },
      moveDown: 0.5,
    },
    stage3: { pauseA: 2.0, moveLeft: 0.7, pauseB: 1.0, moveRight: 0.95, pauseC: 1.0 },
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
      contentFade: 0.8,
    },
  },
};

// ============================================================================
// SCENE SETUP
// ============================================================================

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
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.domElement.style.filter = 'brightness(1)';

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

/**
 * Resets scroll position to top and refreshes ScrollTrigger
 */
function resetScrollToTop() {
  window.scrollTo(0, 0);
  if (window.ScrollTrigger) {
    ScrollTrigger.refresh();
  }
}

/**
 * Initialize scroll restoration behavior
 * Ensures page always starts from top after refresh or navigation
 */
function initScrollRestoration() {
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  resetScrollToTop();
  window.addEventListener('DOMContentLoaded', resetScrollToTop);
  window.addEventListener('load', () => {
    resetScrollToTop();
    requestAnimationFrame(resetScrollToTop);
  });
  window.addEventListener('pageshow', () => {
    resetScrollToTop();
    requestAnimationFrame(resetScrollToTop);
  });
}

initScrollRestoration();

/**
 * Enables/disables links in the info block based on opacity.
 * Links are non-interactive and removed from tab order when fully hidden.
 * @param {number} opacity - Current opacity value for the info block
 */
function updateInfoLinksInteractivity(opacity) {
  const infoBlock = document.querySelector('#infoBlock');
  if (!infoBlock) return;

  const isHidden = opacity <= CONFIG.OPACITY.THRESHOLD_LOW;
  infoBlock.style.pointerEvents = isHidden ? 'none' : 'auto';

  infoBlock.querySelectorAll('a').forEach((link) => {
    if (isHidden) {
      link.setAttribute('tabindex', '-1');
      link.setAttribute('aria-disabled', 'true');
    } else {
      link.removeAttribute('tabindex');
      link.removeAttribute('aria-disabled');
    }
  });
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
  const isMobile = window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;
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
  setObjectOpacity(sceneObjects.panelWhole, CONFIG.OPACITY.VISIBLE, true);

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

  initScrollAnimations(sceneObjects);
}

const loader = new THREE.GLTFLoader();
loader.load('models/scene.glb', processLoadedModel);

// ============================================================================
// SCROLL ANIMATIONS
// ============================================================================

const CONTENT_FADE = {
  OUT: 0.3,
  IN: 0.4,
};

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
 * Adds a DOM opacity tween and keeps pointer events in sync.
 * @param {gsap.core.Timeline} timeline - GSAP timeline
 * @param {HTMLElement | null} element - Element to fade
 * @param {number} opacity - Target opacity
 * @param {number} duration - Tween duration
 * @param {number|string} at - Timeline position
 */
function opacityTweenDOM(timeline, element, opacity, duration, at) {
  if (!element) return;

  timeline.to(
    element,
    {
      opacity,
      duration,
      onUpdate: () => {
        const currentOpacity = Number(gsap.getProperty(element, 'opacity'));
        element.style.pointerEvents = currentOpacity > 0.5 ? 'auto' : 'none';
      },
    },
    at
  );
}

/**
 * Schedules a stage-3 panel transition: fade out content, rotate camera, fade in new content.
 * Returns the time position where this transition ends.
 * @param {Object} params - Transition parameters
 * @returns {number}
 */
function schedulePanelTransition(params) {
  const {
    timeline,
    startAt,
    fromContent,
    toContent,
    cameraLookControl,
    blendProp,
    rotateDuration,
  } = params;

  const rotateStart = startAt + CONTENT_FADE.OUT;
  const fadeInStart = rotateStart + rotateDuration;
  const endAt = fadeInStart + CONTENT_FADE.IN;

  opacityTweenDOM(timeline, fromContent, 0, CONTENT_FADE.OUT, startAt);
  timeline.to(cameraLookControl, { [blendProp]: 1, duration: rotateDuration, ease: 'none' }, rotateStart);
  opacityTweenDOM(timeline, toContent, 1, CONTENT_FADE.IN, fadeInStart);

  return endAt;
}

/**
 * Initializes scroll-based animations for the 3D scene
 * @param {Object} sceneObjects - Object containing references to scene objects
 */
function initScrollAnimations(sceneObjects) {
  gsap.registerPlugin(ScrollTrigger);

  const isMobile = window.innerWidth <= CONFIG.MOBILE_BREAKPOINT;
  const config = isMobile ? ANIMATION_CONFIG.MOBILE : ANIMATION_CONFIG.DESKTOP;

  // Calculate camera zoom positions
  const startZ = camera.position.z;
  const stage1Z = startZ + config.stage1.zoomAmount;
  const stage2Z = startZ + config.stage2.zoomAmount;

  // Calculate animation timing
  const stage1Duration = config.stage1.duration;
  const stage2Duration = config.stage2.duration;
  const timings = {
    stage1Start: 0,
    stage2Start: stage1Duration,
    stage3Start: stage1Duration + stage2Duration,
  };

  const timeline = gsap.timeline({
    scrollTrigger: {
      trigger: ".scroll-spacer",
      start: "top top",
      end: "+=800%",
      scrub: true, // Tighter scroll sync and fully reversible
    },
  });

  // Stage 1: Title/info fade while split panels fade in
  const overlayOpacity = { value: CONFIG.OPACITY.VISIBLE };
  updateInfoLinksInteractivity(overlayOpacity.value);

  timeline.to(
    overlayOpacity,
    {
      value: CONFIG.OPACITY.HIDDEN,
      duration: stage1Duration,
      onUpdate: () => {
        const title = document.querySelector('#title');
        const infoBlock = document.querySelector('#infoBlock');

        if (title) title.style.opacity = overlayOpacity.value;
        if (infoBlock) infoBlock.style.opacity = overlayOpacity.value;

        updateInfoLinksInteractivity(overlayOpacity.value);
      },
    },
    timings.stage1Start
  );

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

  // Stage 3: Show panel contents
  const leftPanelContent = document.querySelector('#leftPanelContent');
  const middlePanelContent = document.querySelector('#middlePanelContent');
  const rightPanelContent = document.querySelector('#rightPanelContent');
  const stage5Content = document.querySelector('#stage5Content');

  // Keep content interaction disabled until content is visibly shown.
  [leftPanelContent, middlePanelContent, rightPanelContent].forEach((content) => {
    if (content) {
      content.style.pointerEvents = 'none';
    }
  });

  // Fade in middle panel content at stage 3 start
  opacityTweenDOM(timeline, middlePanelContent, 1, CONTENT_FADE.OUT, timings.stage3Start);

  let cursor = timings.stage3Start + config.stage3.pauseA;

  if (sceneObjects.panelLeft) {
    cursor = schedulePanelTransition({
      timeline,
      startAt: cursor,
      fromContent: middlePanelContent,
      toContent: leftPanelContent,
      cameraLookControl,
      blendProp: 'leftBlend',
      rotateDuration: config.stage3.moveLeft,
    });
  }

  cursor += config.stage3.pauseB;

  if (sceneObjects.panelRight) {
    cursor = schedulePanelTransition({
      timeline,
      startAt: cursor,
      fromContent: leftPanelContent,
      toContent: rightPanelContent,
      cameraLookControl,
      blendProp: 'rightBlend',
      rotateDuration: config.stage3.moveRight,
    });
  }

  // Stage 4: Pause, then rotate view back to center and move camera backward/up
  cursor += config.stage3.pauseC;
  const stage4Start = cursor + CONTENT_FADE.OUT;

  // Match stage-3 transition behavior: hide current panel content before rotating away
  opacityTweenDOM(timeline, rightPanelContent, 0, CONTENT_FADE.OUT, cursor);

  timeline.to(
    cameraLookControl,
    {
      leftBlend: 0,
      rightBlend: 0,
      duration: config.stage4.rotateToCenter,
      ease: 'none',
      onComplete: () => {
        cameraLookControl.lockCenter = 1;
      },
      onReverseComplete: () => {
        cameraLookControl.lockCenter = 0;
      },
    },
    stage4Start
  );
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

  // Stage 5: Dim the full 3D canvas slightly and reveal non-fixed content section
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
        renderer.domElement.style.filter = `brightness(${stage5Dim.value})`;
      },
    },
    stage5Start
  );

  opacityTweenDOM(
    timeline,
    stage5Content,
    1,
    config.stage5.contentFade,
    stage5Start
  );
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
      material.transparent = true;
      material.opacity = opacity;
      material.depthWrite = opacity >= 1;
      material.needsUpdate = true;
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
  updatePanelsFacingCamera();
  updateCameraLookTarget();

  if (cameraLookControl.enabled > 0.5) {
    camera.lookAt(cameraLookTarget.x, cameraLookTarget.y, cameraLookTarget.z);
  }

  renderer.render(scene, camera);
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

/**
 * Handle window resize event
 */
window.addEventListener('resize', () => {
  setCameraPosition();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});