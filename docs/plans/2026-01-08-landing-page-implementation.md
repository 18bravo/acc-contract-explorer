# Landing Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a visual splash screen with 3D particle cloud forming the WARWERX logo, depth parallax interaction, and zoom-through transition into the app.

**Architecture:** Three.js renders particle system in React via @react-three/fiber. Particles are generated from logo image pixel sampling. Camera moves based on cursor for parallax. Route reorganization moves current home to /contracts, landing becomes root.

**Tech Stack:** Next.js 16, React, Three.js, @react-three/fiber, @react-three/drei, TypeScript, Tailwind CSS

---

### Task 1: Install Three.js Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install packages**

Run:
```bash
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

**Step 2: Verify installation**

Run: `npm ls three @react-three/fiber @react-three/drei`
Expected: All three packages listed with versions

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add Three.js dependencies for landing page"
```

---

### Task 2: Copy Logo to Public Directory

**Files:**
- Create: `public/warwerx.png`

**Step 1: Copy logo file**

Run:
```bash
cp ../../data/warwerx.png public/warwerx.png
```

**Step 2: Verify file exists**

Run: `ls -la public/warwerx.png`
Expected: File exists with reasonable size (~50KB+)

**Step 3: Commit**

```bash
git add public/warwerx.png
git commit -m "assets: add WARWERX logo for particle generation"
```

---

### Task 3: Create Logo Point Extraction Utility

**Files:**
- Create: `src/lib/logoPoints.ts`

**Step 1: Create the point extraction utility**

```typescript
// src/lib/logoPoints.ts

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export async function extractLogoPoints(
  imagePath: string,
  targetCount: number = 2500,
  zSpread: number = 50
): Promise<Point3D[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve([]);
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data, width, height } = imageData;

      // Collect all red-ish pixels (the logo)
      const candidates: { x: number; y: number }[] = [];

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const i = (y * width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          // Red pixels: high red, low green/blue, visible
          if (r > 150 && g < 100 && b < 100 && a > 200) {
            candidates.push({ x, y });
          }
        }
      }

      // Sample to target count
      const points: Point3D[] = [];
      const step = Math.max(1, Math.floor(candidates.length / targetCount));

      for (let i = 0; i < candidates.length && points.length < targetCount; i += step) {
        const { x, y } = candidates[i];

        // Normalize to centered coordinates (-1 to 1 range, then scale)
        const normalizedX = ((x / width) - 0.5) * 100;
        const normalizedY = -((y / height) - 0.5) * 100; // Flip Y for 3D
        const randomZ = (Math.random() - 0.5) * zSpread;

        points.push({
          x: normalizedX,
          y: normalizedY,
          z: randomZ,
        });
      }

      resolve(points);
    };

    img.onerror = () => resolve([]);
    img.src = imagePath;
  });
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit src/lib/logoPoints.ts`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/logoPoints.ts
git commit -m "feat: add logo point extraction utility for particle generation"
```

---

### Task 4: Create Particle Logo Component

**Files:**
- Create: `src/components/landing/ParticleLogo.tsx`

**Step 1: Create the 3D particle component**

```tsx
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

  // Create particle geometry
  const { positions, colors, sizes, depths } = useMemo(() => {
    if (logoPoints.length === 0) {
      return {
        positions: new Float32Array(0),
        colors: new Float32Array(0),
        sizes: new Float32Array(0),
        depths: new Float32Array(0),
      };
    }

    const positions = new Float32Array(logoPoints.length * 3);
    const colors = new Float32Array(logoPoints.length * 3);
    const sizes = new Float32Array(logoPoints.length);
    const depths = new Float32Array(logoPoints.length);

    logoPoints.forEach((point, i) => {
      positions[i * 3] = point.x;
      positions[i * 3 + 1] = point.y;
      positions[i * 3 + 2] = point.z;

      // Red with slight variation
      const brightness = 0.7 + Math.random() * 0.3;
      colors[i * 3] = 0.86 * brightness; // R
      colors[i * 3 + 1] = 0.15 * brightness; // G
      colors[i * 3 + 2] = 0.15 * brightness; // B

      // Size based on depth (closer = larger)
      const depthFactor = (point.z + 25) / 50;
      sizes[i] = 1.5 + depthFactor * 1.5;
      depths[i] = point.z;
    });

    return { positions, colors, sizes, depths };
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

  // Animation loop
  useFrame((state, delta) => {
    if (!pointsRef.current) return;

    const time = state.clock.elapsedTime;

    // Ambient floating animation
    const posArray = pointsRef.current.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < logoPoints.length; i++) {
      const baseY = logoPoints[i].y;
      posArray[i * 3 + 1] = baseY + Math.sin(time * 0.5 + i * 0.1) * 0.5;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;

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

  if (logoPoints.length === 0) return null;

  return (
    <group>
      {/* Particles */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={logoPoints.length}
            array={positions}
            itemSize={3}
          />
          <bufferAttribute
            attach="attributes-color"
            count={logoPoints.length}
            array={colors}
            itemSize={3}
          />
        </bufferGeometry>
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
      {linePositions.length > 0 && (
        <lineSegments ref={linesRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={linePositions.length / 3}
              array={linePositions}
              itemSize={3}
            />
          </bufferGeometry>
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
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors (or only pre-existing ones)

**Step 3: Commit**

```bash
git add src/components/landing/ParticleLogo.tsx
git commit -m "feat: add 3D particle logo component with parallax and transitions"
```

---

### Task 5: Create Landing Hero Wrapper Component

**Files:**
- Create: `src/components/landing/LandingHero.tsx`

**Step 1: Create the hero wrapper component**

```tsx
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
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add src/components/landing/LandingHero.tsx
git commit -m "feat: add landing hero wrapper with canvas, overlay, and transition"
```

---

### Task 6: Create Component Index Export

**Files:**
- Create: `src/components/landing/index.ts`

**Step 1: Create index file**

```typescript
// src/components/landing/index.ts
export { LandingHero } from "./LandingHero";
export { ParticleLogo } from "./ParticleLogo";
```

**Step 2: Commit**

```bash
git add src/components/landing/index.ts
git commit -m "feat: add landing components barrel export"
```

---

### Task 7: Reorganize Routes - Create App Group Layout

**Files:**
- Create: `src/app/(app)/layout.tsx`

**Step 1: Create app group layout with NavTabs**

```tsx
// src/app/(app)/layout.tsx
import { NavTabs } from "@/components/NavTabs";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-zinc-900">
      <header className="bg-zinc-900 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-white">WARWERX</span>
            </div>
            <NavTabs />
          </div>
        </div>
      </header>
      {children}
    </main>
  );
}
```

**Step 2: Commit**

```bash
git add src/app/\(app\)/layout.tsx
git commit -m "feat: add app group layout with navigation header"
```

---

### Task 8: Move Contracts Page to App Group

**Files:**
- Modify: Move `src/app/page.tsx` → `src/app/(app)/contracts/page.tsx`

**Step 1: Copy current home page to contracts route**

Run:
```bash
mkdir -p src/app/\(app\)/contracts
cp src/app/page.tsx src/app/\(app\)/contracts/page.tsx
```

**Step 2: Remove NavTabs from the contracts page**

The page currently imports and renders NavTabs. Since NavTabs is now in the layout, remove it from the page. Edit `src/app/(app)/contracts/page.tsx`:

Find and remove the NavTabs import and usage. The page should render just the content without the header.

**Step 3: Commit**

```bash
git add src/app/\(app\)/contracts/page.tsx
git commit -m "feat: move contracts page to app group"
```

---

### Task 9: Move Other App Pages to App Group

**Files:**
- Move: `src/app/budget/` → `src/app/(app)/budget/`
- Move: `src/app/waste/` → `src/app/(app)/waste/`
- Move: `src/app/risk/` → `src/app/(app)/risk/`

**Step 1: Move all app pages**

Run:
```bash
mv src/app/budget src/app/\(app\)/budget
mv src/app/waste src/app/\(app\)/waste
mv src/app/risk src/app/\(app\)/risk
```

**Step 2: Remove NavTabs from each page if present**

Check each page and remove NavTabs import/usage since it's now in the layout.

**Step 3: Commit**

```bash
git add src/app/\(app\)/budget src/app/\(app\)/waste src/app/\(app\)/risk
git add -u src/app/budget src/app/waste src/app/risk
git commit -m "feat: move budget, waste, risk pages to app group"
```

---

### Task 10: Update NavTabs Paths

**Files:**
- Modify: `src/components/NavTabs.tsx`

**Step 1: Update tab hrefs to match new routes**

The tabs should point to `/contracts`, `/budget`, `/waste`, `/risk` (no change needed if they already do, just verify).

**Step 2: Verify the first tab points to /contracts not /**

```tsx
const tabs = [
  { name: "Contracts", href: "/contracts" },  // Changed from "/"
  { name: "Budget", href: "/budget" },
  { name: "Waste", href: "/waste" },
  { name: "Risk", href: "/risk" },
];
```

**Step 3: Commit if changed**

```bash
git add src/components/NavTabs.tsx
git commit -m "fix: update NavTabs to point to /contracts route"
```

---

### Task 11: Create Landing Page Route

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Replace root page with landing page**

```tsx
// src/app/page.tsx
import { LandingHero } from "@/components/landing";

export default function LandingPage() {
  return <LandingHero />;
}
```

**Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: replace root page with 3D landing hero"
```

---

### Task 12: Clean Up Old Routes

**Files:**
- Delete: `src/app/contracts/page.tsx` (if it exists as duplicate)

**Step 1: Remove any duplicate contract routes**

Run:
```bash
rm -rf src/app/contracts 2>/dev/null || true
```

**Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds with new route structure:
- `/` → Landing page (static)
- `/contracts` → Contracts page
- `/budget`, `/waste`, `/risk` → Other app pages

**Step 3: Commit any cleanup**

```bash
git add -A
git commit -m "chore: clean up duplicate routes after reorganization"
```

---

### Task 13: Final Build Verification

**Files:** None (verification only)

**Step 1: Run production build**

Run: `npm run build`

Expected output should show:
```
Route (app)
├ ○ /                    ← Landing page
├ ○ /contracts           ← Contracts page
├ ○ /budget
├ ○ /waste
├ ○ /risk
├ ƒ /api/...             ← API routes unchanged
```

**Step 2: Test locally**

Run: `npm run dev`

Test:
1. Visit `http://localhost:3000` → See 3D particle logo
2. Move mouse → Particles respond with parallax
3. Click "Enter Platform" → Zoom transition
4. Arrives at `/contracts` with NavTabs visible

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any issues from final testing"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Install Three.js deps | package.json |
| 2 | Copy logo to public | public/warwerx.png |
| 3 | Logo point extraction | src/lib/logoPoints.ts |
| 4 | Particle logo component | src/components/landing/ParticleLogo.tsx |
| 5 | Landing hero wrapper | src/components/landing/LandingHero.tsx |
| 6 | Component exports | src/components/landing/index.ts |
| 7 | App group layout | src/app/(app)/layout.tsx |
| 8 | Move contracts page | src/app/(app)/contracts/page.tsx |
| 9 | Move other pages | src/app/(app)/budget,waste,risk/ |
| 10 | Update NavTabs | src/components/NavTabs.tsx |
| 11 | Landing page route | src/app/page.tsx |
| 12 | Clean up duplicates | Remove old routes |
| 13 | Final verification | Build + manual test |
