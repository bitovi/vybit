import { Badge } from './Badge'

interface CardProps {
  title: string
  description: string
  tag: string
}

export function Card({ title, description, tag }: CardProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <Badge color="blue">{tag}</Badge>
      </div>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  )
}
