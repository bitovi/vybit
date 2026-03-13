import { Button } from './components/Button'
import { Card } from './components/Card'
import { Badge } from './components/Badge'

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Tailwind Visual Editor — Test App</h1>
          <div className="flex gap-2">
            <Button variant="primary">Save</Button>
            <Button variant="secondary">Cancel</Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Cards section — tests multiple instances of same component */}
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Cards (3 instances of Card)</h2>
        <div className="grid grid-cols-3 gap-6 mb-12">
          <Card
            title="Design System"
            description="Create consistent, reusable components for your application."
            tag="UI"
          />
          <Card
            title="Performance"
            description="Optimize bundle size and runtime performance metrics."
            tag="Engineering"
          />
          <Card
            title="Accessibility"
            description="Ensure your app is usable by everyone, including assistive tech."
            tag="A11y"
          />
        </div>

        {/* Buttons section — tests multiple instances with different variants */}
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Buttons (6 instances of Button)</h2>
        <div className="flex flex-wrap gap-3 mb-12">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="primary">Submit</Button>
          <Button variant="secondary">Reset</Button>
          <Button variant="primary">Confirm</Button>
          <Button variant="secondary">Back</Button>
        </div>

        {/* Badges — tests small inline components */}
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Badges (5 instances of Badge)</h2>
        <div className="flex flex-wrap gap-2 mb-12">
          <Badge color="blue">Active</Badge>
          <Badge color="green">Approved</Badge>
          <Badge color="yellow">Pending</Badge>
          <Badge color="red">Rejected</Badge>
          <Badge color="gray">Draft</Badge>
        </div>

        {/* Nested structure — tests deep fiber walking */}
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Nested Structure</h2>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold">JM</div>
            <div>
              <p className="font-medium text-gray-900">Justin Meyer</p>
              <p className="text-sm text-gray-500">Designer</p>
            </div>
          </div>
          <p className="text-gray-600 mb-4">
            This section tests deeply nested elements to verify the pseudo-HTML context builder captures the full ancestor chain correctly.
          </p>
          <div className="flex gap-2">
            <Button variant="primary">Follow</Button>
            <Button variant="secondary">Message</Button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 w-full bg-gray-900 text-gray-400 py-3">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between text-sm">
          <span>Tailwind Visual Editor Test</span>
          <span>v0.1.0</span>
        </div>
      </footer>
    </div>
  )
}

export default App
