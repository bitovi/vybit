import { Button } from './components/Button'
import { Card } from './components/Card'
import { Badge } from './components/Badge'

const CASES = [
  { id: 1, title: 'Vehicle Accident Report', code: '#CAS-001' },
  { id: 2, title: 'Insurance Claim Dispute', code: '#CAS-002' },
  { id: 3, title: 'Policy Coverage Inquiry', code: '#CAS-003' },
  { id: 4, title: 'Premium Adjustment Request', code: '#CAS-004' },
  { id: 5, title: 'Billing Discrepancy', code: '#CAS-005' },
]

// Intentionally no CaseListItem component — items rendered inline via .map()
// This tests the findInlineRepeatedNodes fallback.
function CaseList() {
  const activeId = 2
  return (
    <div className="flex flex-col gap-2">
      {CASES.map(c => (
        <a
          key={c.id}
          href="#"
          className={`flex items-center justify-between px-4 py-4 rounded-lg transition-colors ${
            c.id === activeId ? 'bg-teal-50 border border-teal-300' : 'hover:bg-gray-100 border border-transparent'
          }`}
        >
          <div className="flex flex-col items-start text-sm leading-snug">
            <p className="font-semibold text-teal-700 truncate">{c.title}</p>
            <p className="font-normal text-gray-600 truncate">{c.code}</p>
          </div>
          <div className="flex items-center gap-2 ml-3 shrink-0">
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">open</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </a>
      ))}
    </div>
  )
}

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

        {/* Inline list — tests findInlineRepeatedNodes fallback (no CaseListItem component) */}
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Case List (inline .map(), no item component)</h2>
        <div className="bg-white rounded-lg shadow p-4 mb-12 w-72">
          <CaseList />
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
