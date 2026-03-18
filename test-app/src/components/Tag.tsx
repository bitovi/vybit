interface TagProps {
  color: 'blue' | 'red' | 'green'
  children: React.ReactNode
}

const colorClasses: Record<string, string> = {
  blue: 'bg-blue-100',
  red: 'bg-red-100',
  green: 'bg-green-100',
}

export function Tag({ color, children }: TagProps) {
  return (
    <span className={`inline-block px-3 py-1 rounded text-sm font-medium ${colorClasses[color]}`}>
      {children}
    </span>
  )
}
