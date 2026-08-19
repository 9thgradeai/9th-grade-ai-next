// @ts-nocheck
// eslint-disable-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
// ⚠️ CLIENT-ONLY COMPONENT ⚠️
// This component uses Three.js and must render only on the client.
// It creates a cosmic galaxy/singularity background that sits behind the Hero content.
// Place it in a client-only section of the page.

"use client";

// Three.js types may differ between versions
import * as THREE from "three";

export default function CosmicParticleBackground(): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);
  const onUpdate = useRef<number>(0);

  useEffect(() => {
    // All client-only code runs here, after mount
    const isMobile = /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
    const dpr = Math.min(window.devicePixelRatio, 2);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Create Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e17);

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 200;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x0a0e17, 1);

    // Layer 1: Central dense core
    const coreCount = isMobile ? 300 : 600;
    const coreGeometry = new THREE.BufferGeometry();
    const corePositions = new Float32Array(coreCount * 3);
    const coreColors = new Float32Array(coreCount * 3);

    for (let i = 0; i < coreCount; i++) {
      const radius = 20 + Math.random() * 30;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      corePositions[i * 3] = x;
      corePositions[i * 3 + 1] = y;
      corePositions[i * 3 + 2] = z;

      // Cyan/blue/white gradient
      const hue = 0.5 + Math.random() * 0.3;
      const color = new THREE.Color().setHSL(hue, 0.8, 0.6);
      coreColors[i * 3] = color.r;
      coreColors[i * 3 + 1] = color.g;
      coreColors[i * 3 + 2] = color.b;
    }

    const coreGeometry_attrib_pos = new THREE.BufferAttribute(corePositions, 3);
    const coreGeometry_attrib_col = new THREE.BufferAttribute(coreColors, 3);

    const coreMaterial = new THREE.ShaderMaterial({
      vertex: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        varying vec2 vUv;
        void main() {
          vColor = color;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (200.0 / -position.z);
        }
      `,
      fragment: `
        precision highp float;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.7) discard;
          gl_FragColor = vec4(vColor, 1.0 - d);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
    });

    const corePoints = new THREE.Points(
      coreGeometry,
      coreMaterial
    );
    coreGeometry.setAttribute("position", coreGeometry_attrib_pos);
    coreGeometry.setAttribute("color", coreGeometry_attrib_col);
    scene.add(corePoints);

    // Layer 2: Inner galaxy particles
    const innerCount = isMobile ? 500 : 1000;
    const innerGeometry = new THREE.BufferGeometry();
    const innerPositions = new Float32Array(innerCount * 3);
    const innerColors = new Float32Array(innerCount * 3);
    const innerSizes = new Float32Array(innerCount);

    for (let i = 0; i < innerCount; i++) {
      const radius = 50 + Math.random() * 70;
      const theta = (i / innerCount) * Math.PI * 2 + Math.random() * 0.5;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = radius * Math.sin(phi);
      const x = r * Math.cos(theta) * (0.8 + Math.random() * 0.4);
      const y = r * Math.sin(phi) * (0.8 + Math.random() * 0.4);
      const z = radius * Math.cos(phi) * (0.6 + Math.random() * 0.4);

      innerPositions[i * 3] = x;
      innerPositions[i * 3 + 1] = y;
      innerPositions[i * 3 + 2] = z;

      const hue = 0.5 + Math.random() * 0.3;
      const color = new THREE.Color().setHSL(hue, 0.7, 0.5);
      innerColors[i * 3] = color.r;
      innerColors[i * 3 + 1] = color.g;
      innerColors[i * 3 + 2] = color.b;

      innerSizes[i] = 1 + Math.random();
    }

    const innerGeometry_attrib_pos = new THREE.BufferAttribute(innerPositions, 3);
    const innerGeometry_attrib_col = new THREE.BufferAttribute(innerColors, 3);

    const innerMaterial = new THREE.ShaderMaterial({
      vertex: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        varying vec2 vUv;
        void main() {
          vColor = color;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (150.0 / -position.z);
        }
      `,
      fragment: `
        precision highp float;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.6) discard;
          gl_FragColor = vec4(vColor, 1.0 - d);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
    });

    const innerPoints = new THREE.Points(
      innerGeometry,
      innerMaterial
    );
    innerGeometry.setAttribute("position", innerGeometry_attrib_pos);
    innerGeometry.setAttribute("color", innerGeometry_attrib_col);
    scene.add(innerPoints);

    // Layer 3: Spiral arms
    const spiralCount = isMobile ? 400 : 1500;
    const spiralGeometry = new THREE.BufferGeometry();
    const spiralPositions = new Float32Array(spiralCount * 3);
    const spiralColors = new Float32Array(spiralCount * 3);
    const spiralSizes = new Float32Array(spiralCount);

    for (let i = 0; i < spiralCount; i++) {
      const t = (i / spiralCount) * Math.PI * 2;
      const radius = 30 + Math.random() * 50 + Math.sin(t * 3) * 10;
      const x = radius * Math.cos(t) * (0.7 + Math.random() * 0.3);
      const y = radius * Math.sin(t) * (0.7 + Math.random() * 0.3);
      const z = (Math.sin(t * 2) * 15) * (0.5 + Math.random() * 0.5);

      spiralPositions[i * 3] = x;
      spiralPositions[i * 3 + 1] = y;
      spiralPositions[i * 3 + 2] = z;

      const hue = 0.6 + Math.random() * 0.2;
      const color = new THREE.Color().setHSL(hue, 0.8, 0.4);
      spiralColors[i * 3] = color.r;
      spiralColors[i * 3 + 1] = color.g;
      spiralColors[i * 3 + 2] = color.b;

      spiralSizes[i] = 0.5 + Math.random();
    }

    const spiralGeometry_attrib_pos = new THREE.BufferAttribute(spiralPositions, 3);
    const spiralGeometry_attrib_col = new THREE.BufferAttribute(spiralColors, 3);

    const spiralMaterial = new THREE.ShaderMaterial({
      vertex: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        varying vec2 vUv;
        void main() {
          vColor = color;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (100.0 / -position.z);
        }
      `,
      fragment: `
        precision highp float;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vColor, 1.0 - d);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
    });

    const spiralPoints = new THREE.Points(
      spiralGeometry,
      spiralMaterial
    );
    spiralGeometry.setAttribute("position", spiralGeometry_attrib_pos);
    spiralGeometry.setAttribute("color", spiralGeometry_attrib_col);
    scene.add(spiralPoints);

    // Layer 4: Outer cosmic dust
    const dustCount = isMobile ? 200 : 400;
    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    const dustColors = new Float32Array(dustCount * 3);
    const dustSizes = new Float32Array(dustCount);

    for (let i = 0; i < dustCount; i++) {
      const radius = 150 + Math.random() * 100;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = radius * Math.sin(phi) * Math.cos(theta) * (0.5 + Math.random() * 0.5);
      const y = radius * Math.sin(phi) * Math.sin(theta) * (0.5 + Math.random() * 0.5);
      const z = radius * Math.cos(phi) * (0.5 + Math.random() * 0.5);

      dustPositions[i * 3] = x;
      dustPositions[i * 3 + 1] = y;
      dustPositions[i * 3 + 2] = z;

      const hue = 0.7 + Math.random() * 0.2;
      const color = new THREE.Color().setHSL(hue, 0.5, 0.3);
      dustColors[i * 3] = color.r;
      dustColors[i * 3 + 1] = color.g;
      dustColors[i * 3 + 2] = color.b;

      dustSizes[i] = 0.5 + Math.random();
    }

    const dustGeometry_attrib_pos = new THREE.BufferAttribute(dustPositions, 3);
    const dustGeometry_attrib_col = new THREE.BufferAttribute(dustColors, 3);

    const dustMaterial = new THREE.ShaderMaterial({
      vertex: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        varying vec2 vUv;
        void main() {
          vColor = color;
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (80.0 / -position.z);
        }
      `,
      fragment: `
        precision highp float;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vColor, 1.0 - d);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
    });

    const dustPoints = new THREE.Points(
      dustGeometry,
      dustMaterial
    );
    dustGeometry.setAttribute("position", dustGeometry_attrib_pos);
    dustGeometry.setAttribute("color", dustGeometry_attrib_col);
    scene.add(dustPoints);

    // Camera and renderer
    camera.position.z = 300;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x0a0e17, 1);

    // Animation state
    let time = 0;
    let animationId = 0;

    function animate() {
      time += 0.016;
      corePoints.rotation.y = time * 0.05;
      innerPoints.rotation.y = time * 0.08;
      spiralPoints.rotation.y = time * 0.06;
      dustPoints.rotation.y = time * 0.03;

      renderer.setPixelRatio(dpr);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.render(scene, camera);

      animationId = requestAnimationFrame(animate);
    }

    animate();

    // Handle resize
    const handleResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
      coreGeometry.dispose();
      coreGeometry_attrib_pos.dispose;
      coreGeometry_attrib_col.dispose;
      innerGeometry.dispose();
      innerGeometry_attrib_pos.dispose;
      innerGeometry_attrib_col.dispose;
      spiralGeometry.dispose();
      spiralGeometry_attrib_pos.dispose;
      spiralGeometry_attrib_col.dispose;
      dustGeometry.dispose();
      dustGeometry_attrib_pos.dispose;
      dustGeometry_attrib_col.dispose;
      corePoints.geometry.dispose;
      innerPoints.geometry.dispose;
      spiralPoints.geometry.dispose;
      dustPoints.geometry.dispose;
    };
  }, []); // Empty deps – runs once on client mount

  return null;
}