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
