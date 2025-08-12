# Command: Create React Hook

## Description
This command scaffolds a new, production-ready custom React hook and its corresponding test file, adhering to the Thunderbird-ESQ project's specific standards.

## Instructions

When a user requests a new custom hook, you **MUST** follow these steps precisely:

1.  **File Naming:** The hook file must be named in `camelCase` with a `.ts` extension (e.g., `useWindowSize.ts`). The test file must be named `useWindowSize.test.ts`.

2.  **Hook Structure:**
    * The hook **MUST** be a standard TypeScript function whose name starts with `use`.
    * It **MUST** use built-in React hooks (`useState`, `useEffect`, `useCallback`, etc.) to manage its logic.
    * The return value **MUST** be clearly defined with a TypeScript type alias.
    * The code **MUST** be thoroughly commented with JSDoc comments explaining its purpose, parameters, and return value.

3.  **Test File Structure:**
    * The test file **MUST** use Jest and React Testing Library's `renderHook` utility.
    * Tests **MUST** verify the hook's initial state, how it responds to events or changes, and the final output.
    * Use `act` from React Testing Library to wrap any code that causes state updates.

## Example Output

**Request:** "Create a `useToggle` hook that manages a boolean state."

**You will generate two files:**

**File 1: `src/lib/hooks/useToggle.ts`**
```ts
'use client';

import { useState, useCallback } from 'react';

/**
 * A custom hook to manage a boolean toggle state.
 * @param {boolean} [initialState=false] - The initial state of the toggle.
 * @returns {[boolean, () => void]} A tuple containing the current state and a function to toggle it.
 */
export function useToggle(initialState: boolean = false): [boolean, () => void] {
  const [state, setState] = useState(initialState);

  const toggle = useCallback(() => {
    setState((prevState) => !prevState);
  }, []);

  return [state, toggle];
}
```

**File 2: `src/lib/hooks/useToggle.test.ts`**
```ts
import { renderHook, act } from '@testing-library/react';
import { useToggle } from './useToggle';

describe('useToggle', () => {
  it('should initialize with the default value of false', () => {
    const { result } = renderHook(() => useToggle());
    expect(result.current[0]).toBe(false);
  });

  it('should initialize with the provided initial value', () => {
    const { result } = renderHook(() => useToggle(true));
    expect(result.current[0]).toBe(true);
  });

  it('should toggle the state when the toggle function is called', () => {
    const { result } = renderHook(() => useToggle());

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(true);

    act(() => {
      result.current[1]();
    });

    expect(result.current[0]).toBe(false);
  });
});

$ARGUMENTS

