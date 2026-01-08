// src/components/landing/LandingHero.tsx
"use client";

import { useState, useCallback, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { useRouter } from "next/navigation";
import { ParticleLogo } from "./ParticleLogo";

export function LandingHero() {
  const router = useRouter();
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showFlash, setShowFlash] = useState(false);

  // Track mouse position normalized to -1 to 1
  const handleMouseMove = useCallback((e: MouseEvent) => {
    const x = (e.clientX / window.innerWidth) * 2 - 1;
    const y = -(e.clientY / window.innerHeight) * 2 + 1;
    setMousePosition({ x, y });
  }, []);

  useEffect(() => {
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [handleMouseMove]);

  // Preload the contracts page
  useEffect(() => {
    router.prefetch("/contracts");
  }, [router]);

  const handleEnter = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
  };

  const handleTransitionComplete = () => {
    setShowFlash(true);
    setTimeout(() => {
      router.push("/contracts");
    }, 300);
  };

  return (
    <div className="relative w-screen h-screen bg-[#0a0a0a] overflow-hidden">
      {/* Three.js Canvas */}
      <Canvas
        camera={{ position: [0, 0, 150], fov: 50 }}
        className="absolute inset-0"
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={0.5} />
        <ParticleLogo
          mousePosition={mousePosition}
          isTransitioning={isTransitioning}
          onTransitionComplete={handleTransitionComplete}
        />
      </Canvas>

      {/* Vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, transparent 50%, rgba(0,0,0,0.6) 100%)",
        }}
      />

      {/* Content overlay */}
      <div
        className={`absolute inset-0 flex flex-col items-center justify-end pb-24 transition-opacity duration-500 ${
          isTransitioning ? "opacity-0" : "opacity-100"
        }`}
      >
        <h1 className="text-5xl md:text-7xl font-bold text-white tracking-wider mb-4">
          WARWERX
        </h1>
        <p className="text-lg md:text-xl text-zinc-400 mb-12">
          Contract Intelligence Platform
        </p>
        <button
          onClick={handleEnter}
          disabled={isTransitioning}
          className="px-8 py-4 bg-red-600 hover:bg-red-500 text-white font-semibold text-lg rounded-lg transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Enter Platform
        </button>
      </div>

      {/* Flash overlay for transition */}
      <div
        className={`absolute inset-0 bg-white pointer-events-none transition-opacity duration-300 ${
          showFlash ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
