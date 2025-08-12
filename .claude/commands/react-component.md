# Command: Create React Component

## Description
This command scaffolds a new, production-ready React component and its corresponding test file, adhering to the Thunderbird-ESQ project's specific standards.

## Instructions

When a user requests a new component, you **MUST** follow these steps precisely:

1.  **File Naming:** The component file must be named in `PascalCase` with a `.tsx` extension (e.g., `MyComponent.tsx`). The test file must be named `MyComponent.test.tsx`.

2.  **Component Structure:**
    * The component **MUST** be a functional component using TypeScript.
    * It **MUST** include the `'use client';` directive at the top, as all interactive components in this project are client components.
    * Props **MUST** be typed using a `type` alias (e.g., `type MyComponentProps = { ... };`).
    * Styling **MUST** be done exclusively with Tailwind CSS utility classes via the `className` prop. Use the `cn` utility from `@/lib/utils` for conditional classes.
    * Leverage existing **Shadcn/UI components** from `@/components/ui` whenever possible to maintain visual consistency.

3.  **Test File Structure:**
    * The test file **MUST** use Jest and React Testing Library.
    * It **MUST** include a basic "smoke test" that renders the component and asserts that it does not throw an error.
    * Use `describe` to group tests for the component and `it` for individual test cases.

## Example Output

**Request:** "Create a UserAvatar component that takes a `src` and `alt` prop."

**You will generate two files:**

**File 1: `src/components/UserAvatar.tsx`**
```tsx
'use client';

import { cn } from '@/lib/utils';
import Image from 'next/image';

type UserAvatarProps = {
  src: string;
  alt: string;
  className?: string;
};

export function UserAvatar({ src, alt, className }: UserAvatarProps) {
  return (
    <div className={cn('relative h-10 w-10 overflow-hidden rounded-full', className)}>
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes="40px"
      />
    </div>
  );
}
```

**File 2: `src/components/UserAvatar.test.tsx`**
```tsx
import { render, screen } from '@testing-library/react';
import { UserAvatar } from './UserAvatar';
import '@testing-library/jest-dom';

describe('UserAvatar', () => {
  it('renders the avatar image with the correct alt text', () => {
    const testSrc = '[https://example.com/avatar.png](https://example.com/avatar.png)';
    const testAlt = 'Test User Avatar';

    render(<UserAvatar src={testSrc} alt={testAlt} />);

    const image = screen.getByAltText(testAlt);
    expect(image).toBeInTheDocument();
  });
});

$ARGUMENTS

