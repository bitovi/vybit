interface ButtonProps {
  variant: 'primary' | 'secondary'
  children: React.ReactNode
}

export function Button({ variant, children }: ButtonProps) {
  const base = 'px-4 py-2 rounded-md text-sm font-medium transition-colors'
  const styles = variant === 'primary'
    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'

  return (
    <button className={`${base} ${styles}`}>
      {children}
    </button>
  )
}
