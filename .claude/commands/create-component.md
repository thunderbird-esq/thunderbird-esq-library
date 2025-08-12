# Command: Create React Component

## Description
This command scaffolds a new, production-ready React component and its corresponding test file, adhering to the Thunderbird-ESQ project's specific standards.

## Instructions

When a user requests a new component, you **MUST** follow these steps precisely:

1.  **File Naming & Location:**
    * Component files **MUST** be placed in `src/components/`.
    * The component file must be named in `PascalCase` with a `.tsx` extension (e.g., `MyComponent.tsx`).
    * The test file must be named `MyComponent.test.tsx` and placed in the same directory.

2.  **Component Structure:**
    * The component **MUST** include the `'use client';` directive at the top.
    * It **MUST** be a functional component using TypeScript.
    * Props **MUST** be typed using a `type` alias (e.g., `type MyComponentProps = { ... };`).
    * Styling **MUST** be done exclusively with Tailwind CSS utility classes. Use the `cn` utility from `@/lib/utils` for conditional classes.
    * Leverage existing **Shadcn/UI components** from `@/components/ui` whenever possible to maintain visual consistency.

3.  **Test File Structure:**
    * The test file **MUST** use Jest and React Testing Library.
    * It **MUST** include a basic "smoke test" that renders the component and asserts that it does not throw an error.
    * Follow the testing mandates in `TESTING_STRATEGY.md`, including testing from the user's perspective.

## Example Output

**Request:** "Create a `StatusPill` component that takes a `status` prop which can be 'success', 'warning', or 'error'."

**You will generate two files:**

**File 1: `src/components/ui/StatusPill.tsx`**
```tsx
'use client';

import { cn } from '@/lib/utils';

type StatusPillProps = {
  status: 'success' | 'warning' | 'error';
  className?: string;
};

const statusStyles = {
  success: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

export function StatusPill({ status, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
        statusStyles[status],
        className
      )}
    >
      {status}
    </span>
  );
}
```

**File 2: `src/components/ui/StatusPill.test.tsx`**
```tsx
import { render, screen } from '@testing-library/react';
import { StatusPill } from './StatusPill';
import '@testing-library/jest-dom';

describe('StatusPill', () => {
  it('renders the success status correctly', () => {
    render(<StatusPill status="success" />);
    const pill = screen.getByText('success');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveClass('bg-green-100 text-green-800');
  });

  it('renders the warning status correctly', () => {
    render(<StatusPill status="warning" />);
    const pill = screen.getByText('warning');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveClass('bg-yellow-100 text-yellow-800');
  });

  it('renders the error status correctly', () => {
    render(<StatusPill status="error" />);
    const pill = screen.getByText('error');
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveClass('bg-red-100 text-red-800');
  });
});

$ARGUMENTS

