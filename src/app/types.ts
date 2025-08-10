// src/app/types.ts

/**
 * A standardized structure for the return value of server actions.
 * @template T The type of the data returned on success.
 */
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}
