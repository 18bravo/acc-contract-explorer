# WARWERX Landing Page Design

## Overview

A visual splash screen featuring a 3D particle cloud that forms the WARWERX logo (sword through gear). The particles respond to cursor movement with depth parallax, and clicking "Enter Platform" triggers a zoom-through transition into the app.

## Visual Design

**Color scheme:** Dark mode with red accents
- Background: #0a0a0a (near black)
- Particles: #dc2626 (red) with brightness variation
- Connection lines: White or dim red, low opacity
- Text: White
- CTA button: Red with white text

**Logo source:** `data/warwerx.png` - sword piercing a gear cog

## Page Structure

```
Landing Page (/)
├── Three.js Canvas (z-0, fullscreen)
│   └── Particle logo floating in 3D space
├── Gradient overlay (z-10, vignette at edges)
└── Content overlay (z-20)
    ├── "WARWERX" title
    ├── "Contract Intelligence Platform" tagline
    └── "Enter Platform" CTA button
```

**Route changes:**
- `/` → Landing splash (no navigation)
- `/contracts` → Current home page (moved)
- App pages share layout with NavTabs via `(app)` route group

## 3D Particle System

**Generation:**
1. Load WARWERX logo image
2. Sample positions where red pixels exist
3. Convert 2D coordinates to 3D points (Z randomized for depth)
4. Target: 2,000-3,000 particles

**Particle properties:**
- Shape: Small spheres with glow
- Color: Red (#dc2626) with variation
- Size: Varies by depth (closer = larger)
- Connections: Lines between nearby particles (network effect)

**Depth distribution:**
- Z-axis range: -50 to +50 units
- Logo recognizable from front view
- Creates layered depth for parallax

**Ambient animation:**
- Subtle Y-axis floating drift (sine wave)
- Gentle brightness pulse
- Connection lines fade in/out with particle drift

## Parallax Interaction

**Cursor tracking:**
- Mouse position normalized to -1 to +1
- Smooth interpolation (lerp) for fluid movement
- Updates each animation frame

**Depth-based response:**
| Depth | Movement Range |
|-------|----------------|
| Near (Z=+50) | ±30px |
| Mid (Z=0) | ±15px |
| Far (Z=-50) | ±5px |

**Implementation:** Move camera subtly rather than individual particles. More performant and creates natural "looking around" feel.

**Mobile:** Gyroscope-based parallax via DeviceOrientationEvent. Fallback to touch-drag if unavailable.

## Zoom Transition

**Trigger:** Click "Enter Platform" button

**Sequence (1.5 seconds):**
1. **0-0.3s** - Button fades, particles brighten (anticipation)
2. **0.3-1.2s** - Camera accelerates forward through particle field
   - Particles streak past (warp speed effect)
   - FOV widens for motion blur feel
   - Red particles leave trails
3. **1.2-1.5s** - White flash peaks, fades to reveal dashboard

**Navigation:** Route to `/contracts` after transition completes. Preload during splash idle time for instant feel.

## Technical Implementation

**Dependencies:**
```json
{
  "three": "^0.170.0",
  "@react-three/fiber": "^9.0.0",
  "@react-three/drei": "^10.0.0"
}
```

**File structure:**
```
src/
  app/
    page.tsx                    # Landing page
    (app)/
      layout.tsx                # App shell with NavTabs
      page.tsx                  # Contracts (moved from root)
      budget/page.tsx
      waste/page.tsx
      risk/page.tsx
  components/
    landing/
      ParticleLogo.tsx          # 3D particle system
      LandingHero.tsx           # Wrapper with text/button overlay
  lib/
    logoPoints.ts               # Point data extracted from logo
public/
  warwerx.png                   # Logo image (copied from data/)
```

**Performance:**
- Target: 60fps on modern devices
- Fallback: Static logo image if WebGL unavailable
- Bundle impact: ~150KB (Three.js tree-shaken)

## Mobile Considerations

- Gyroscope parallax with reduced sensitivity
- Touch-drag fallback
- Particle count reduced on low-end devices (detect via `navigator.hardwareConcurrency`)
- WebGL availability check with graceful degradation
