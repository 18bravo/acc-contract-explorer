// src/components/landing/ParticleLogo.tsx
"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { extractLogoPoints, Point3D } from "@/lib/logoPoints";

interface ParticleLogoProps {
  mousePosition: { x: number; y: number };
  isTransitioning: boolean;
  onTransitionComplete?: () => void;
}

export function ParticleLogo({
  mousePosition,
  isTransitioning,
  onTransitionComplete,
}: ParticleLogoProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const [logoPoints, setLogoPoints] = useState<Point3D[]>([]);
  const transitionProgress = useRef(0);
  const { camera } = useThree();

  // Load logo points on mount
  useEffect(() => {
    extractLogoPoints("/warwerx.png", 2500, 50).then(setLogoPoints);
  }, []);

  // Create particle geometry data
  const { positions, colors } = useMemo(() => {
    if (logoPoints.length === 0) {
      return {
        positions: new Float32Array(0),
        colors: new Float32Array(0),
      };
    }

    const positions = new Float32Array(logoPoints.length * 3);
    const colors = new Float32Array(logoPoints.length * 3);

    logoPoints.forEach((point, i) => {
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;

      // Red with slight variation
      const brightness = 0.7 + Math.random() * 0.3;
      colors[i * 3] = 0.86 * brightness; // R
      colors[i * 3 + 1] = 0.15 * brightness; // G
      colors[i * 3 + 2] = 0.15 * brightness; // B
    });

    return { positions, colors };
  }, [logoPoints]);

  // Create connection lines between nearby particles
  const linePositions = useMemo(() => {
    if (logoPoints.length === 0) return new Float32Array(0);

    const lines: number[] = [];
    const maxDistance = 8;
    const maxConnections = 3000;
    let connectionCount = 0;

    for (let i = 0; i < logoPoints.length && connectionCount < maxConnections; i++) {
      for (let j = i + 1; j < logoPoints.length && connectionCount < maxConnections; j++) {
        const dx = logoPoints[i].x - logoPoints[j].x;
        const dy = logoPoints[i].y - logoPoints[j].y;
        const dz = logoPoints[i].z - logoPoints[j].z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < maxDistance) {
          lines.push(
            logoPoints[i].x, logoPoints[i].y, logoPoints[i].z,
            logoPoints[j].x, logoPoints[j].y, logoPoints[j].z
          );
          connectionCount++;
        }
      }
    }

    return new Float32Array(lines);
  }, [logoPoints]);

  // Create geometries with proper buffer attributes
  const particleGeometry = useMemo(() => {
    if (positions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geometry;
  }, [positions, colors]);

  const lineGeometry = useMemo(() => {
    if (linePositions.length === 0) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(linePositions, 3));
    return geometry;
  }, [linePositions]);

  // Animation loop
  useFrame((state, delta) => {
    if (!pointsRef.current || !particleGeometry) return;

    const time = state.clock.elapsedTime;

    // Ambient floating animation
    const posAttr = particleGeometry.attributes.position as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;
    for (let i = 0; i < logoPoints.length; i++) {
      const baseY = logoPoints[i].y;
      posArray[i * 3 + 1] = baseY + Math.sin(time * 0.5 + i * 0.1) * 0.5;
    }
    posAttr.needsUpdate = true;

    // Depth parallax - move camera based on mouse
    if (!isTransitioning) {
      const targetX = mousePosition.x * 15;
      const targetY = mousePosition.y * 10;
      camera.position.x += (targetX - camera.position.x) * 0.05;
      camera.position.y += (targetY - camera.position.y) * 0.05;
      camera.lookAt(0, 0, 0);
    }

    // Zoom transition
    if (isTransitioning) {
      transitionProgress.current += delta * 0.8;
      const progress = Math.min(transitionProgress.current, 1);

      // Accelerating zoom
      const eased = progress * progress * progress;
      camera.position.z = 150 - eased * 300;

      // Widen FOV for speed effect
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.fov = 50 + eased * 30;
        camera.updateProjectionMatrix();
      }

      if (progress >= 1 && onTransitionComplete) {
        onTransitionComplete();
      }
    }
  });

  if (logoPoints.length === 0 || !particleGeometry) return null;

  return (
    <group>
      {/* Particles */}
      <points ref={pointsRef} geometry={particleGeometry}>
        <pointsMaterial
          size={2}
          vertexColors
          transparent
          opacity={0.9}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Connection lines */}
      {lineGeometry && (
        <lineSegments ref={linesRef} geometry={lineGeometry}>
          <lineBasicMaterial
            color="#dc2626"
            transparent
            opacity={0.15}
            blending={THREE.AdditiveBlending}
          />
        </lineSegments>
      )}
    </group>
  );
}
