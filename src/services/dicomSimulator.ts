/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type SliceOrientation = 'axial' | 'coronal' | 'sagittal';

export interface WindowLevelPreset {
  name: string;
  windowWidth: number;
  windowCenter: number;
}

export const WINDOW_PRESETS: Record<string, WindowLevelPreset> = {
  BONE: { name: 'Bone (Orthopedic)', windowWidth: 2000, windowCenter: 450 },
  SOFT_TISSUE: { name: 'Soft Tissue', windowWidth: 400, windowCenter: 40 },
  LUNG: { name: 'Thoracic / Lung', windowWidth: 1500, windowCenter: -600 },
  DYNAMIC: { name: 'Full Dynamic HU', windowWidth: 4096, windowCenter: 0 },
};

export class DicomSimulator {
  /**
   * Generates a 2D canvas frame representing an authentic CT shoulder slice
   * at normalized position (0.0 to 1.0) for a given orientation.
   */
  public static renderSlice(
    canvas: HTMLCanvasElement,
    orientation: SliceOrientation,
    normalizedSlice: number, // 0.0 - 1.0
    windowWidth: number,
    windowCenter: number,
    showCrosshair: boolean = false,
    crosshairX: number = 0.5,
    crosshairY: number = 0.5
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    const minHU = windowCenter - windowWidth / 2;
    const maxHU = windowCenter + windowWidth / 2;

    const huToLuminance = (hu: number) => {
      if (hu <= minHU) return 0;
      if (hu >= maxHU) return 255;
      return Math.round(((hu - minHU) / windowWidth) * 255);
    };

    // Calculate synthetic anatomical attenuation field
    // Shoulder model:
    // Humeral head center roughly at (0.65, 0.45)
    // Glenoid fossa roughly at (0.48, 0.45)
    // Scapular blade extending medially (0.25 to 0.45)
    // Clavicle superiorly
    const z = normalizedSlice; // 0 (superior) to 1 (inferior) or anterior-posterior

    for (let y = 0; y < height; y++) {
      const ny = y / height;
      for (let x = 0; x < width; x++) {
        const nx = x / width;
        const idx = (y * width + x) * 4;

        let hu = -1000; // Background air

        if (orientation === 'axial') {
          hu = this.getAxialHU(nx, ny, z);
        } else if (orientation === 'coronal') {
          hu = this.getCoronalHU(nx, ny, z);
        } else {
          hu = this.getSagittalHU(nx, ny, z);
        }

        // Add subtle detector noise (typical CT Poisson/Gaussian quantum noise)
        const noise = (Math.random() - 0.5) * 18;
        const lum = huToLuminance(hu + noise);

        data[idx] = lum;
        data[idx + 1] = lum;
        data[idx + 2] = lum;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Draw Crosshairs if enabled
    if (showCrosshair) {
      ctx.save();
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      const cx = crosshairX * width;
      const cy = crosshairY * height;

      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, height);
      ctx.moveTo(0, cy);
      ctx.lineTo(width, cy);
      ctx.stroke();

      ctx.restore();
    }
  }

  private static getAxialHU(x: number, y: number, z: number): number {
    // Body contour (thorax & arm soft tissue outline)
    const thoraxDist = Math.hypot((x - 0.32) * 1.1, (y - 0.6) * 0.9);
    const armDist = Math.hypot((x - 0.68) * 1.0, (y - 0.46) * 1.0);

    let hu = -1000;

    // Soft tissue chest & shoulder girdle
    if (thoraxDist < 0.38 || armDist < 0.22 || (x > 0.3 && x < 0.65 && y > 0.35 && y < 0.65)) {
      hu = 35; // Muscle / soft tissue

      // Subcutaneous fat rim
      if (thoraxDist > 0.34 || armDist > 0.18) {
        hu = -80; // Adipose tissue
      }

      // Lung field in thorax
      const lungDist = Math.hypot((x - 0.28) * 1.2, (y - 0.62) * 1.1);
      if (lungDist < 0.20 && z > 0.15 && z < 0.85) {
        hu = -750; // Lung parenchymal air
      }

      // Rib cage cortical bone
      const ribDist = Math.abs(lungDist - 0.21);
      if (ribDist < 0.015 && z > 0.15 && z < 0.85) {
        hu = 1100;
      }

      // Glenoid & Scapula
      // Glenoid face at x ~ 0.50, y ~ 0.46
      const glenoidDist = Math.hypot((x - 0.50) * 1.4, (y - 0.46) * 1.0);
      // Scapular spine / blade extending to x ~ 0.35
      const bladeDist = Math.abs((y - 0.47) - (0.48 - x) * 0.4);

      if (glenoidDist < 0.055 && z > 0.25 && z < 0.65) {
        hu = 1250; // Dense glenoid cortical bone
        if (glenoidDist < 0.035) hu = 320; // Cancellous bone
      } else if (bladeDist < 0.018 && x > 0.26 && x <= 0.50 && z > 0.2 && z < 0.8) {
        hu = 1150; // Scapular blade cortex
      }

      // Humeral Head (round ball)
      const humHeadDist = Math.hypot((x - 0.66) * 1.0, (y - 0.46) * 1.0);
      const humRadius = 0.11 * (1 - Math.abs(z - 0.45) * 1.5);

      if (humRadius > 0.02 && humHeadDist < humRadius) {
        const corticalRim = Math.abs(humHeadDist - humRadius);
        if (corticalRim < 0.014) {
          hu = 1400; // Humeral head cortical bone
        } else {
          hu = 280; // Humeral cancellous trabecular bone
        }
      }

      // Humeral shaft as we move inferiorly
      if (z > 0.58) {
        const shaftDist = Math.hypot((x - 0.67) * 1.0, (y - 0.48) * 1.0);
        if (shaftDist < 0.06) {
          hu = shaftDist > 0.035 ? 1600 : 80; // Dense cortical bone + medullary canal
        }
      }
    }

    return hu;
  }

  private static getCoronalHU(x: number, y: number, z: number): number {
    // Coronal slice (x: medial to lateral, y: superior to inferior)
    let hu = -1000;
    const thoraxDist = Math.hypot((x - 0.35) * 1.1, (y - 0.6) * 0.9);
    const armDist = Math.hypot((x - 0.68) * 1.1, (y - 0.52) * 1.0);

    if (thoraxDist < 0.38 || armDist < 0.22 || (x > 0.3 && x < 0.62 && y > 0.3 && y < 0.7)) {
      hu = 40;

      // Acromion (Superior shelf)
      if (y > 0.24 && y < 0.27 && x > 0.48 && x < 0.65) {
        hu = 1200;
      }

      // Clavicle
      if (y > 0.22 && y < 0.25 && x > 0.30 && x < 0.50) {
        hu = 1150;
      }

      // Scapula glenoid vault
      const glenoidDist = Math.hypot((x - 0.50) * 1.3, (y - 0.42) * 0.9);
      if (glenoidDist < 0.06) {
        hu = glenoidDist > 0.035 ? 1300 : 350;
      }

      // Scapular lateral border
      const latBorder = Math.abs((x - 0.46) - (y - 0.45) * 0.3);
      if (latBorder < 0.02 && y > 0.45 && y < 0.75) {
        hu = 1100;
      }

      // Humeral head
      const humHeadDist = Math.hypot((x - 0.64) * 1.0, (y - 0.42) * 1.0);
      if (humHeadDist < 0.10) {
        hu = humHeadDist > 0.082 ? 1450 : 310;
      }

      // Humeral shaft
      if (y >= 0.48 && x > 0.59 && x < 0.71) {
        const distFromCenter = Math.abs(x - 0.65);
        hu = distFromCenter > 0.03 ? 1550 : 70;
      }
    }

    return hu;
  }

  private static getSagittalHU(x: number, y: number, z: number): number {
    // Sagittal slice (x: anterior to posterior, y: superior to inferior)
    let hu = -1000;
    const bodyDist = Math.hypot((x - 0.5) * 1.1, (y - 0.5) * 0.9);

    if (bodyDist < 0.35) {
      hu = 45;

      // Glenoid face / tear-drop pear shape
      const glenoidCenterDist = Math.hypot((x - 0.5) * 1.2, (y - 0.46) * 1.0);
      if (glenoidCenterDist < 0.07) {
        hu = glenoidCenterDist > 0.045 ? 1350 : 290;
      }

      // Coracoid process anteriorly
      if (x > 0.32 && x < 0.42 && y > 0.32 && y < 0.38) {
        hu = 1250;
      }

      // Acromion spine posteriorly
      if (x > 0.55 && x < 0.72 && y > 0.26 && y < 0.32) {
        hu = 1200;
      }
    }

    return hu;
  }
}
