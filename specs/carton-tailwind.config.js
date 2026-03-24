export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
  	extend: {
  		boxShadow: {
  			xs: '0 1px 2px 0 rgb(0 0 0 / 0.05)'
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			/* ========================================
  			   Bitovi Design System
  			   ======================================== */
  			gray: {
  				950: 'var(--gray-950)',
  				900: 'var(--gray-900)',
  				800: 'var(--gray-800)',
  				700: 'var(--gray-700)',
  				600: 'var(--gray-600)',
  				500: 'var(--gray-500)',
  				400: 'var(--gray-400)',
  				300: 'var(--gray-300)',
  				200: 'var(--gray-200)',
  				100: 'var(--gray-100)',
  				50: 'var(--gray-50)',
  			},
  			teal: {
  				950: 'var(--teal-950)',
  				900: 'var(--teal-900)',
  				800: 'var(--teal-800)',
  				700: 'var(--teal-700)',
  				600: 'var(--teal-600)',
  				500: 'var(--teal-500)',
  				400: 'var(--teal-400)',
  				300: 'var(--teal-300)',
  				200: 'var(--teal-200)',
  				100: 'var(--teal-100)',
  				50: 'var(--teal-50)',
  			},
  			orange: {
  				950: 'var(--orange-950)',
  				900: 'var(--orange-900)',
  				800: 'var(--orange-800)',
  				700: 'var(--orange-700)',
  				600: 'var(--orange-600)',
  				500: 'var(--orange-500)',
  				400: 'var(--orange-400)',
  				300: 'var(--orange-300)',
  				200: 'var(--orange-200)',
  				100: 'var(--orange-100)',
  				50: 'var(--orange-50)',
  			},
  			green: {
  				950: 'var(--green-950)',
  				900: 'var(--green-900)',
  				800: 'var(--green-800)',
  				700: 'var(--green-700)',
  				600: 'var(--green-600)',
  				500: 'var(--green-500)',
  				400: 'var(--green-400)',
  				300: 'var(--green-300)',
  				200: 'var(--green-200)',
  				100: 'var(--green-100)',
  				50: 'var(--green-50)',
  			},
  			yellow: {
  				950: 'var(--yellow-950)',
  				900: 'var(--yellow-900)',
  				800: 'var(--yellow-800)',
  				700: 'var(--yellow-700)',
  				600: 'var(--yellow-600)',
  				500: 'var(--yellow-500)',
  				400: 'var(--yellow-400)',
  				300: 'var(--yellow-300)',
  				200: 'var(--yellow-200)',
  				100: 'var(--yellow-100)',
  				50: 'var(--yellow-50)',
  			},
  			violet: {
  				950: 'var(--violet-950)',
  				900: 'var(--violet-900)',
  				800: 'var(--violet-800)',
  				700: 'var(--violet-700)',
  				600: 'var(--violet-600)',
  				500: 'var(--violet-500)',
  				400: 'var(--violet-400)',
  				300: 'var(--violet-300)',
  				200: 'var(--violet-200)',
  				100: 'var(--violet-100)',
  				50: 'var(--violet-50)',
  			},
  			blue: {
  				950: 'var(--blue-950)',
  				900: 'var(--blue-900)',
  				800: 'var(--blue-800)',
  				700: 'var(--blue-700)',
  				600: 'var(--blue-600)',
  				500: 'var(--blue-500)',
  				400: 'var(--blue-400)',
  				300: 'var(--blue-300)',
  				200: 'var(--blue-200)',
  				100: 'var(--blue-100)',
  				50: 'var(--blue-50)',
  			},
  			pink: {
  				950: 'var(--pink-950)',
  				900: 'var(--pink-900)',
  				800: 'var(--pink-800)',
  				700: 'var(--pink-700)',
  				600: 'var(--pink-600)',
  				500: 'var(--pink-500)',
  				400: 'var(--pink-400)',
  				300: 'var(--pink-300)',
  				200: 'var(--pink-200)',
  				100: 'var(--pink-100)',
  				50: 'var(--pink-50)',
  			},
  			white: 'var(--white)',
  			
  			/* ========================================
  			   Obra Design System
  			   ======================================== */
  			background: 'var(--background)',
  			foreground: {
  				DEFAULT: 'var(--foreground)',
  				alt: 'var(--foreground-alt)'
  			},
  			card: {
  				DEFAULT: 'var(--card)',
  				foreground: 'var(--card-foreground)'
  			},
  			popover: {
  				DEFAULT: 'var(--popover)',
  				foreground: 'var(--popover-foreground)'
  			},
  			primary: {
  				DEFAULT: 'var(--primary)',
  				foreground: 'var(--primary-foreground)',
  				hover: 'var(--primary-hover)'
  			},
  			secondary: {
  				DEFAULT: 'var(--secondary)',
  				foreground: 'var(--secondary-foreground)',
  				hover: 'var(--secondary-hover)'
  			},
  			muted: {
  				DEFAULT: 'var(--muted)',
  				foreground: 'var(--muted-foreground)'
  			},
  			accent: {
  				DEFAULT: 'var(--accent)',
  				foreground: 'var(--accent-foreground)',
  				0: 'var(--accent-0)',
  				2: 'var(--accent-2)',
  				3: 'var(--accent-3)'
  			},
  			destructive: {
  				DEFAULT: 'var(--destructive)',
  				foreground: 'var(--destructive-foreground)',
  				subtle: 'var(--destructive-subtle)',
  				border: 'var(--destructive-border)'
  			},
  			border: {
  				DEFAULT: 'var(--border)',
  				0: 'var(--border-0)',
  				1: 'var(--border-1)',
  				3: 'var(--border-3)',
  				4: 'var(--border-4)',
  				5: 'var(--border-5)'
  			},
  			input: 'var(--input)',
  			ring: {
  				DEFAULT: 'var(--ring)',
  				error: 'var(--ring-error)'
  			},
  			ghost: {
  				DEFAULT: 'var(--ghost)',
  				hover: 'var(--ghost-hover)',
  				foreground: 'var(--ghost-foreground)'
  			},
  			outline: {
  				DEFAULT: 'var(--outline)',
  				hover: 'var(--outline-hover)',
  				active: 'var(--outline-active)'
  			},
  			backdrop: 'var(--backdrop)',
  			'mid-alt': 'var(--mid-alt)',
  			'body-background': 'var(--body-background)',
  			sidebar: {
  				DEFAULT: 'var(--sidebar)',
  				foreground: 'var(--sidebar-foreground)',
  				accent: 'var(--sidebar-accent)',
  				'accent-foreground': 'var(--sidebar-accent-foreground)',
  				primary: 'var(--sidebar-primary)',
  				'primary-foreground': 'var(--sidebar-primary-foreground)',
  				border: 'var(--sidebar-border)',
  				ring: 'var(--sidebar-ring)'
  			},
  			chart: {
  				'1': 'var(--chart-1)',
  				'2': 'var(--chart-2)',
  				'3': 'var(--chart-3)',
  				'4': 'var(--chart-4)',
  				'5': 'var(--chart-5)'
  			}
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
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require('tailwindcss-animate')],
};
