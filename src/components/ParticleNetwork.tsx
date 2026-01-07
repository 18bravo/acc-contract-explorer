"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const PARTICLE_COUNT = 100;
const CONNECTION_DISTANCE = 2.5;
const BOUNDS = 8;

interface ParticleData {
  positions: Float32Array;
  velocities: Float32Array;
}

function Particles({ mouse }: { mouse: React.RefObject<{ x: number; y: number }> }) {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const { viewport } = useThree();

  // Initialize particle data
  const particleData = useMemo<ParticleData>(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * BOUNDS * 2;
      positions[i3 + 1] = (Math.random() - 0.5) * BOUNDS;
      positions[i3 + 2] = (Math.random() - 0.5) * BOUNDS;

      velocities[i3] = (Math.random() - 0.5) * 0.01;
      velocities[i3 + 1] = (Math.random() - 0.5) * 0.01;
      velocities[i3 + 2] = (Math.random() - 0.5) * 0.01;
    }

    return { positions, velocities };
  }, []);

  // Create geometry for points
  const pointsGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(particleData.positions.slice(), 3));
    return geometry;
  }, [particleData]);

  // Create geometry for lines (connections)
  const linesGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    // Pre-allocate for max possible connections
    const maxConnections = (PARTICLE_COUNT * (PARTICLE_COUNT - 1)) / 2;
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(maxConnections * 6), 3));
    geometry.setDrawRange(0, 0);
    return geometry;
  }, []);

  useFrame((state) => {
    if (!pointsRef.current || !linesRef.current) return;

    const positions = particleData.positions;
    const velocities = particleData.velocities;
    const time = state.clock.elapsedTime;

    // Mouse parallax effect
    const mouseX = mouse.current?.x ?? 0;
    const mouseY = mouse.current?.y ?? 0;
    const parallaxX = mouseX * 0.5;
    const parallaxY = mouseY * 0.3;

    // Update particle positions
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;

      // Add velocity
      positions[i3] += velocities[i3];
      positions[i3 + 1] += velocities[i3 + 1];
      positions[i3 + 2] += velocities[i3 + 2];

      // Gentle wave motion
      positions[i3 + 1] += Math.sin(time * 0.5 + positions[i3] * 0.5) * 0.002;

      // Boundary wrapping
      if (positions[i3] > BOUNDS) positions[i3] = -BOUNDS;
      if (positions[i3] < -BOUNDS) positions[i3] = BOUNDS;
      if (positions[i3 + 1] > BOUNDS / 2) positions[i3 + 1] = -BOUNDS / 2;
      if (positions[i3 + 1] < -BOUNDS / 2) positions[i3 + 1] = BOUNDS / 2;
      if (positions[i3 + 2] > BOUNDS / 2) positions[i3 + 2] = -BOUNDS / 2;
      if (positions[i3 + 2] < -BOUNDS / 2) positions[i3 + 2] = BOUNDS / 2;
    }

    // Update points geometry
    const pointsPositions = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    pointsPositions.array.set(positions);
    pointsPositions.needsUpdate = true;

    // Calculate and update line connections
    const linePositions = linesRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const lineArray = linePositions.array as Float32Array;
    let lineIndex = 0;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      for (let j = i + 1; j < PARTICLE_COUNT; j++) {
        const i3 = i * 3;
        const j3 = j * 3;

        const dx = positions[i3] - positions[j3];
        const dy = positions[i3 + 1] - positions[j3 + 1];
        const dz = positions[i3 + 2] - positions[j3 + 2];
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (distance < CONNECTION_DISTANCE) {
          lineArray[lineIndex++] = positions[i3];
          lineArray[lineIndex++] = positions[i3 + 1];
          lineArray[lineIndex++] = positions[i3 + 2];
          lineArray[lineIndex++] = positions[j3];
          lineArray[lineIndex++] = positions[j3 + 1];
          lineArray[lineIndex++] = positions[j3 + 2];
        }
      }
    }

    linePositions.needsUpdate = true;
    linesRef.current.geometry.setDrawRange(0, lineIndex / 3);

    // Apply mouse parallax to the entire group
    pointsRef.current.rotation.y = time * 0.05 + parallaxX * 0.5;
    pointsRef.current.rotation.x = parallaxY * 0.3;
    linesRef.current.rotation.y = time * 0.05 + parallaxX * 0.5;
    linesRef.current.rotation.x = parallaxY * 0.3;
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Particles */}
      <points ref={pointsRef} geometry={pointsGeometry}>
        <pointsMaterial
          size={0.08}
          color="#ef4444"
          transparent
          opacity={0.8}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Accent particles (white) */}
      <points geometry={pointsGeometry}>
        <pointsMaterial
          size={0.04}
          color="#ffffff"
          transparent
          opacity={0.4}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* Connection lines */}
      <lineSegments ref={linesRef} geometry={linesGeometry}>
        <lineBasicMaterial
          color="#ef4444"
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
        />
      </lineSegments>
    </group>
  );
}

function Scene({ mouse }: { mouse: React.RefObject<{ x: number; y: number }> }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <Particles mouse={mouse} />
    </>
  );
}

export function ParticleNetwork() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouse = useRef({ x: 0, y: 0 });
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  if (!isClient) {
    return (
      <div
        ref={containerRef}
        className="absolute inset-0 -z-10"
        style={{ background: "transparent" }}
      />
    );
  }

  return (
    <div ref={containerRef} className="absolute inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 60 }}
        gl={{ alpha: true, antialias: true }}
        style={{ background: "transparent" }}
      >
        <Scene mouse={mouse} />
      </Canvas>
    </div>
  );
}
