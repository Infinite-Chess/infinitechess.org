// src/client/scripts/esm/audio/processors/worklet-types.ts

/**
 * Stores missing audio worklet typescript types that apparently
 * aren't present in the @types/audioworklet package.
 */

/** Describes a parameter for an AudioWorkletProcessor. */
export interface AudioParamDescriptor {
	name: string;
	defaultValue?: number;
	minValue?: number;
	maxValue?: number;
	automationRate?: 'a-rate' | 'k-rate';
}
