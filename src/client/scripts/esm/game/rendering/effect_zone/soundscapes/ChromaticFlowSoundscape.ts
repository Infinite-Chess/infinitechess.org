import { SoundscapeConfig } from "../../../../audio/SoundscapePlayer";


const config: SoundscapeConfig = {
	masterVolume: 0.25,
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
        	type: "bandpass",
        	frequency: {
        		base: 745
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        },
        {
        	type: "bandpass",
        	frequency: {
        		base: 746
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        }
      ]
    },
    {
    	volume: {
    		base: 0.103
    	},
    	source: {
    		type: "noise"
    	},
    	filters: [
        {
        	type: "bandpass",
        	frequency: {
        		base: 995
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        },
        {
        	type: "lowpass",
        	frequency: {
        		base: 1000
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        }
      ]
    },
    {
    	volume: {
    		base: 0.272
    	},
    	source: {
    		type: "noise"
    	},
    	filters: [
        {
        	type: "bandpass",
        	frequency: {
        		base: 1513
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        },
        {
        	type: "bandpass",
        	frequency: {
        		base: 1508
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        }
      ]
    },
    {
    	volume: {
    		base: 0.101
    	},
    	source: {
    		type: "noise"
    	},
    	filters: [
        {
        	type: "bandpass",
        	frequency: {
        		base: 2001
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        },
        {
        	type: "bandpass",
        	frequency: {
        		base: 2002
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        }
      ]
    }
  ]
};



const configLower = {
	masterVolume: 0.25,
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
        	type: "bandpass",
        	frequency: {
        		base: 868
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        },
        {
        	type: "bandpass",
        	frequency: {
        		base: 865
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        }
      ]
    },
    {
    	volume: {
    		base: 0.25
    	},
    	source: {
    		type: "noise"
    	},
    	filters: [
        {
        	type: "bandpass",
        	frequency: {
        		base: 1744
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        },
        {
        	type: "bandpass",
        	frequency: {
        		base: 1745
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        }
      ]
    },
    {
    	volume: {
    		base: 0.379
    	},
    	source: {
    		type: "noise"
    	},
    	filters: [
        {
        	type: "bandpass",
        	frequency: {
        		base: 1296
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        },
        {
        	type: "bandpass",
        	frequency: {
        		base: 1298
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        }
      ]
    },
    {
    	volume: {
    		base: 0.002
    	},
    	source: {
    		type: "noise"
    	},
    	filters: [
        {
        	type: "lowpass",
        	frequency: {
        		base: 635
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        },
        {
        	type: "lowpass",
        	frequency: {
        		base: 636
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        }
      ]
    },
    {
    	volume: {
    		base: 0.25
    	},
    	source: {
    		type: "noise"
    	},
    	filters: [
        {
        	type: "bandpass",
        	frequency: {
        		base: 426
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        },
        {
        	type: "bandpass",
        	frequency: {
        		base: 426
        	},
        	Q: {
        		base: 29.9901
        	},
        	gain: {
        		base: 0
        	}
        }
      ]
    }
  ]
};