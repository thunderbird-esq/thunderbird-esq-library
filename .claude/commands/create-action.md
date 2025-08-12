# Command: Create Server Action

## Description
This command scaffolds a new, production-ready server action within `src/app/actions.ts`, adhering to the Thunderbird-ESQ project's strict standards for backend logic, error handling, and type safety.

## Instructions

When a user requests a new server action, you **MUST** follow these steps precisely:

1.  **File Location:** All new server actions **MUST** be added to the existing `src/app/actions.ts` file. Do not create new files for actions.

2.  **Action Structure:**
    * The function **MUST** be an `async` function.
    * All arguments **MUST** be strongly typed.
    * The function **MUST** have an explicit return type of `Promise<ActionResult<T>>`, importing `ActionResult` from `src/app/types.ts`. Replace `T` with the specific type of data returned on success (e.g., `string`, `number`, `boolean`, `any[]`).

3.  **Error Handling & Return Values:**
    * The entire body of the function **MUST** be wrapped in a single `try/catch` block.
    * On a successful execution, the function **MUST** return an object with the shape `{ success: true, data: ... }`.
    * If any error is caught, the function **MUST** first `console.error` the full error object for server-side logging.
    * After logging, the function **MUST** return an object with the shape `{ success: false, error: 'A user-friendly error message.' }`. The error message should be informative but not expose sensitive implementation details.

## Example Output

**Request:** "Create a server action to delete a document by its ID."

**You will add the following code to `src/app/actions.ts`:**

```ts
/**
 * Deletes all chunks associated with a specific document ID from the database.
 * @param documentId The identifier of the document to delete.
 * @returns An ActionResult indicating the number of chunks deleted or an error.
 */
export async function deleteDocument(documentId: string): Promise<ActionResult<number>> {
  if (!documentId) {
    return { success: false, error: 'Document ID cannot be empty.' };
  }

  const { createClient } = await import('@/lib/supabase/server');
  
  try {
    const supabase = await createClient();
    const { data, error, count } = await supabase
      .from('documents')
      .delete()
      .match({ document_id: documentId });

    if (error) {
      throw new Error(`Supabase delete failed: ${error.message}`);
    }

    return { success: true, data: count || 0 };

  } catch (error) {
    console.error('Error deleting document:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
    return { success: false, error: `Failed to delete document: ${errorMessage}` };
  }
}

$ARGUMENTS

