
import { SoundscapeConfig } from "../../../../audio/SoundscapePlayer";

const config: SoundscapeConfig = {
	masterVolume: 0.36,
	layers: [
		{
			volume: {
				base: 1
			},
			source: {
				type: "noise"
			},
			filters: [
				{
					type: "lowpass",
					frequency: {
						base: 136
					},
					Q: {
						base: 1.0001
					},
					gain: {
						base: 0
					}
				},
				{
					type: "lowpass",
					frequency: {
						base: 138
					},
					Q: {
						base: 1.0001
					},
					gain: {
						base: 0
					}
				}
			]
		}
	]
};

export default {
	config,
};