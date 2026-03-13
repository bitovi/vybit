interface BadgeProps {
  color: 'blue' | 'green' | 'yellow' | 'red' | 'gray'
  children: React.ReactNode
}

const colorMap: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-800',
  red: 'bg-red-100 text-red-700',
  gray: 'bg-gray-100 text-gray-600',
}

export function Badge({ color, children }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorMap[color]}`}>
      {children}
    </span>
  )
}
