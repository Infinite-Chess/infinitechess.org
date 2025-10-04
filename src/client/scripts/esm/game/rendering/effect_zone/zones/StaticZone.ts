
// src/client/scripts/esm/game/rendering/effect_zone/zones/StaticZone.ts

import { PostProcessPass } from "../../../../webgl/post_processing/PostProcessingPipeline";
import { Zone } from "../EffectZoneManager";
import { ProgramManager } from "../../../../webgl/ProgramManager";

export class StaticZone implements Zone {

    /** The unique integer id this effect zone gets. */
    readonly effectType: number = 3;

    /** How many pixels wide the white noise texture is. */
    private readonly TEXTURE_WIDTH = 256;
    /** How large each "pixel" of the static should be, in screen pixels. */
    private readonly PIXEL_SIZE = 4;
    /** How often the static pattern should change, in milliseconds. */
    private readonly UPDATE_INTERVAL = 100; // 10 times per second

    
    // --- STATE ---

    /** The last timestamp the pixels were randomized. */
    private lastUpdateTime: number = 0;
    /** The current UV offset. */
    private uvOffset: [number, number] = [0, 0];

    
    constructor(programManager: ProgramManager) {
        // FUTURE: Create other color grade effects...
    }


    public update(): void {
        // Randomize the pixels every little bit.
        const now = Date.now();
        if (now - this.lastUpdateTime > this.UPDATE_INTERVAL) {
            this.lastUpdateTime = now;
            // Generate a random offset, but snap it to the pixel grid.
            this.uvOffset = [
                Math.floor(Math.random() * this.TEXTURE_WIDTH) / this.TEXTURE_WIDTH,
                Math.floor(Math.random() * this.TEXTURE_WIDTH) / this.TEXTURE_WIDTH,
            ];
        }
    }

    public getUniforms(): Record<string, any> {
        return {
            u3_uvOffset: this.uvOffset,
            u3_pixelSize: this.PIXEL_SIZE,
        };
    }

    public getPasses(): PostProcessPass[] {
        return []; // No post-processing effects for this zone
    }

    public fadeInAmbience(transitionDurationMillis: number): void {
        
    }

    public fadeOutAmbience(transitionDurationMillis: number): void {
        
    }
}