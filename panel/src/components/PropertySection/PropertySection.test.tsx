import { render, screen, fireEvent } from '@testing-library/react';
import { PropertySection } from './PropertySection';
import type { AvailableProperty } from './types';

const sampleProperties: AvailableProperty[] = [
  { name: 'Text color', prefixHint: 'text-{color}', prefix: 'text-color' },
  { name: 'Text align', prefixHint: 'text-{align}', prefix: 'text-align' },
  { name: 'Line height', prefixHint: 'leading-*', prefix: 'leading' },
];

test('renders section label', () => {
  render(<PropertySection label="Typography" />);
  expect(screen.getByText('Typography')).toBeInTheDocument();
});

test('shows empty state message when isEmpty is true', () => {
  render(<PropertySection label="Backgrounds" isEmpty />);
  expect(screen.getByText(/no backgrounds classes/i)).toBeInTheDocument();
});

test('renders children when not empty', () => {
  render(
    <PropertySection label="Typography">
      <span>text-lg</span>
      <span>font-bold</span>
    </PropertySection>
  );
  expect(screen.getByText('text-lg')).toBeInTheDocument();
  expect(screen.getByText('font-bold')).toBeInTheDocument();
});

test('does not show + button when no availableProperties', () => {
  render(<PropertySection label="Typography" />);
  expect(screen.queryByLabelText(/add typography/i)).not.toBeInTheDocument();
});

test('shows + button when availableProperties exist', () => {
  render(
    <PropertySection label="Typography" availableProperties={sampleProperties} />
  );
  expect(screen.getByLabelText('Add Typography property')).toBeInTheDocument();
});

test('opens dropdown on + button click', () => {
  render(
    <PropertySection label="Typography" availableProperties={sampleProperties} />
  );
  fireEvent.click(screen.getByLabelText('Add Typography property'));
  expect(screen.getByText('Text color')).toBeInTheDocument();
  expect(screen.getByText('Text align')).toBeInTheDocument();
  expect(screen.getByText('Line height')).toBeInTheDocument();
});

test('calls onAddProperty and closes dropdown when item is clicked', () => {
  const onAdd = vi.fn();
  render(
    <PropertySection
      label="Typography"
      availableProperties={sampleProperties}
      onAddProperty={onAdd}
    />
  );
  fireEvent.click(screen.getByLabelText('Add Typography property'));
  fireEvent.click(screen.getByText('Line height'));
  expect(onAdd).toHaveBeenCalledWith('leading');
  // Dropdown should close
  expect(screen.queryByText('Text color')).not.toBeInTheDocument();
});

test('closes dropdown when clicking outside', () => {
  render(
    <div>
      <span data-testid="outside">outside</span>
      <PropertySection
        label="Typography"
        availableProperties={sampleProperties}
      />
    </div>
  );
  fireEvent.click(screen.getByLabelText('Add Typography property'));
  expect(screen.getByText('Text color')).toBeInTheDocument();

  fireEvent.mouseDown(screen.getByTestId('outside'));
  expect(screen.queryByText('Text color')).not.toBeInTheDocument();
});

test('toggles dropdown closed on second + click', () => {
  render(
    <PropertySection label="Typography" availableProperties={sampleProperties} />
  );
  const btn = screen.getByLabelText('Add Typography property');
  fireEvent.click(btn);
  expect(screen.getByText('Text color')).toBeInTheDocument();
  fireEvent.click(btn);
  expect(screen.queryByText('Text color')).not.toBeInTheDocument();
});

test('auto-expands when isEmpty transitions from true to false', () => {
  const { rerender, container } = render(
    <PropertySection label="Sizing" isEmpty>
      <span>w-full</span>
    </PropertySection>
  );
  // Initially empty = collapsed, collapsible div should have max-h-0
  const collapseDiv = container.querySelector('.overflow-hidden') as HTMLElement;
  expect(collapseDiv.className).toContain('max-h-0');

  // Simulate a property being added — isEmpty becomes false
  rerender(
    <PropertySection label="Sizing" isEmpty={false}>
      <span>w-full</span>
    </PropertySection>
  );
  expect(collapseDiv.className).not.toContain('max-h-0');
});
