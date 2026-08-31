/** @type {import('tailwindcss').Config} */
export default {
	darkMode: ["class"],
	// Single recursive scan covers every component path. The previous list
	// duplicated paths and pointed to folders that don't exist (src/pages,
	// src/app/(auth)), bloating the scan and not helping Tailwind purge.
	content: ["./src/**/*.{html,js,ts,jsx,tsx,mdx}"],
	theme: {
    	extend: {
    		fontFamily: {
    			sans: [
    				'var(--font-almarai)',
    				'Almarai',
    				'system-ui',
    				'sans-serif'
    			],
    			almarai: [
    				'var(--font-almarai)',
    				'Almarai',
    				'sans-serif'
    			],
    			'ibm-plex-arabic': [
    				'var(--font-ibm-plex-arabic)',
    				'IBM Plex Sans Arabic',
    				'sans-serif'
    			],
    			'dm-sans': [
    				'var(--font-dm-sans)',
    				'DM Sans',
    				'sans-serif'
    			],
    			lalezar: [
    				'var(--font-lalezar)',
    				'Lalezar',
    				'cursive'
    			],
    			noto: [
    				'var(--font-noto-sans-arabic)'
    			]
    		},
    		colors: {
    			border: 'hsl(var(--border))',
    			input: 'hsl(var(--input))',
    			ring: 'hsl(var(--ring))',
    			background: 'hsl(var(--background))',
    			foreground: 'hsl(var(--foreground))',
    			primary: {
    				DEFAULT: 'hsl(var(--primary))',
    				foreground: 'hsl(var(--primary-foreground))'
    			},
    			secondary: {
    				DEFAULT: 'hsl(var(--secondary))',
    				foreground: 'hsl(var(--secondary-foreground))'
    			},
    			destructive: {
    				DEFAULT: 'hsl(var(--destructive))',
    				foreground: 'hsl(var(--destructive-foreground))'
    			},
    			muted: {
    				DEFAULT: 'hsl(var(--muted))',
    				foreground: 'hsl(var(--muted-foreground))'
    			},
    			accent: {
    				DEFAULT: 'hsl(var(--accent))',
    				foreground: 'hsl(var(--accent-foreground))'
    			},
    			popover: {
    				DEFAULT: 'hsl(var(--popover))',
    				foreground: 'hsl(var(--popover-foreground))'
    			},
    			card: {
    				DEFAULT: 'hsl(var(--card))',
    				foreground: 'hsl(var(--card-foreground))'
    			},
    			brand: {
    				primary: '#46194F',
    				light: '#fff',
    				dark: '#1f0c23',
    				DEFAULT: '#46194F'
    			},
    			sidebar: {
    				DEFAULT: 'hsl(var(--sidebar-background))',
    				foreground: 'hsl(var(--sidebar-foreground))',
    				primary: 'hsl(var(--sidebar-primary))',
    				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
    				accent: 'hsl(var(--sidebar-accent))',
    				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
    				border: 'hsl(var(--sidebar-border))',
    				ring: 'hsl(var(--sidebar-ring))'
    			}
    		},
    		width: {
    			'fit-content': 'fit-content'
    		},
    		borderRadius: {
    			lg: 'var(--radius)',
    			md: 'calc(var(--radius) - 2px)',
    			sm: 'calc(var(--radius) - 4px)'
    		},
    		keyframes: {
    			'accordion-down': {
    				from: {
    					height: '0'
    				},
    				to: {
    					height: 'var(--radix-accordion-content-height)'
    				}
    			},
    			'accordion-up': {
    				from: {
    					height: 'var(--radix-accordion-content-height)'
    				},
    				to: {
    					height: '0'
    				}
    			},
    			shimmer: {
    				'0%': {
    					transform: 'translateX(-100%)'
    				},
    				'100%': {
    					transform: 'translateX(100%)'
    				}
    			},
    			fadeIn: {
    				'0%': {
    					opacity: '0',
    					transform: 'translateY(10px)'
    				},
    				'100%': {
    					opacity: '1',
    					transform: 'translateY(0)'
    				}
    			},
    			'pulse-glow': {
    				'0%, 100%': {
    					boxShadow: '0 0 10px rgba(70, 25, 79, 0.3), 0 0 20px rgba(70, 25, 79, 0.2), 0 0 30px rgba(70, 25, 79, 0.1)'
    				},
    				'50%': {
    					boxShadow: '0 0 15px rgba(70, 25, 79, 0.5), 0 0 30px rgba(70, 25, 79, 0.3), 0 0 45px rgba(70, 25, 79, 0.2)'
    				}
    			},
    			'slide-up': {
    				'0%': {
    					opacity: '0',
    					transform: 'translateY(100%)'
    				},
    				'100%': {
    					opacity: '1',
    					transform: 'translateY(0)'
    				}
    			},
    			swing: {
    				'0%, 100%': {
    					transform: 'rotate(0deg)'
    				},
    				'25%': {
    					transform: 'rotate(6deg)'
    				},
    				'75%': {
    					transform: 'rotate(-6deg)'
    				}
    			},
    			'nav-progress': {
    				'0%': {
    					transform: 'scaleX(0)'
    				},
    				'20%': {
    					transform: 'scaleX(0.3)'
    				},
    				'50%': {
    					transform: 'scaleX(0.6)'
    				},
    				'80%': {
    					transform: 'scaleX(0.8)'
    				},
    				'100%': {
    					transform: 'scaleX(0.9)'
    				}
    			}
    		},
    		screens: {
    			tablet: '768px',
    			'tablet-max': {
    				max: '1023px'
    			},
    			'ipad-landscape': {
    				min: '1024px',
    				max: '1366px'
    			}
    		},
    		animation: {
    			'accordion-down': 'accordion-down 0.2s ease-out',
    			'accordion-up': 'accordion-up 0.2s ease-out',
    			shimmer: 'shimmer 2s cubic-bezier(0.4, 0.0, 0.6, 1) infinite',
    			fadeIn: 'fadeIn 0.3s ease-out forwards',
    			'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
    			'slide-up': 'slide-up 0.3s ease-out',
    			swing: 'swing 3s ease-in-out infinite',
    			'swing-d1': 'swing 3s ease-in-out 0.4s infinite',
    			'swing-d2': 'swing 3s ease-in-out 0.9s infinite',
    			'swing-d3': 'swing 3s ease-in-out 1.4s infinite',
    			'nav-progress': 'nav-progress 2s ease-out forwards'
    		}
    	}
    },
	plugins: [
		require("tailwindcss-animate"),
	],
}

