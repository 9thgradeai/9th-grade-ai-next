"use client";

import * as THREE from "three";
import { useRef, useEffect } from "react";

export default function StarfieldBackground(): React.ReactNode {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isMobile = /Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
    const dpr = Math.min(window.devicePixelRatio, 2);

    // Create container styles
    const container = containerRef.current;
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.width = "100%";
    container.style.height = "100%";
    container.style.zIndex = "-10";
    container.style.pointerEvents = "none";
    container.style.background = "#0a0e17";

    // Create Three.js scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e17);

    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 300;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(dpr);
    renderer.setClearColor(0x0a0e17, 1);

    // Adaptive particle count
    const baseCount = isMobile ? 400 : 1500;
    const extraCount = reducedMotion ? 0 : 400;
    const totalCount = baseCount + extraCount;

    // Create particles
    const positions = new Float32Array(totalCount * 3);
    const sizes = new Float32Array(totalCount);

    // Color will be set per-particle in the shader varying
    // We'll use a simple color scheme: cyan for core, blue for middle, white for outer

    for (let i = 0; i < totalCount; i++) {
      // Layered effect: core, middle, outer
      let radius;
      const layer = Math.floor((i / totalCount) * 3);

      if (layer === 0) {
        // Core: small, dense
        radius = 20 + Math.random() * 20;
      } else if (layer === 1) {
        // Middle: medium
        radius = 40 + Math.random() * 30;
      } else {
        // Outer: large, faint
        radius = 80 + Math.random() * 40;
      }

      const theta = (i / totalCount) * Math.PI * 2 + Math.random() * 0.5;
      const phi = Math.acos(2 * Math.random() - 1);
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Size: 3..7px base, adaptive for mobile
      const baseSize = isMobile ? 2 : 3;
      sizes[i] = baseSize + Math.random() * 4; // 3..7px
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));

    // Shader material - note: we use varying for color, but get color from
    // the fragment shader's gl_PointCoord or use a uniform color
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPointSize: { value: 1.0 },
        // Use a single color for all points - set in JS if needed
        uColor: { value: new THREE.Color(0x06d6a0) } // stellar cyan
      },
      vertexShader: `
        attribute float aSize;
        varying vec3 vColor;
        uniform vec3 uColor;
        void main() {
          vColor = uColor;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (200.0 / -position.z);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying vec3 vColor;
        void main() {
          // Fade out at edges
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.85) discard;
          gl_FragColor = vec4(vColor, 1.0 - (d - 0.7) * 4.0);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      // Remove vertexColors: true since we're using a uniform color instead
    });

    const stars = new THREE.Points(geometry, material);
    scene.add(stars);

    // Animation loop using requestAnimationFrame
    let time = 0;
    let animationId: number = 0;

    const animate = () => {
      time += 0.016;
      stars.rotation.y = time * 0.03;
      stars.rotation.x = time * 0.02;
      material.uniforms.uTime.value = time;
      renderer.setPixelRatio(dpr);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };

    animate();

    // Handle resize
    const handleResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    // Initial render to container
    const canvas = renderer.domElement;
    if (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(canvas);

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationId);
      renderer.dispose();
      geometry.dispose();
    };
  }, []); // Empty deps – runs once on client mount

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: -10,
        pointerEvents: "none",
        background: "#0a0e17",
      }}
    />
  );
}