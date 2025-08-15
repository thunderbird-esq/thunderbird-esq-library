## Description

Please include a summary of the change and which issue is fixed. Please also include relevant motivation and context. List any dependencies that are required for this change.

## JULES Protocol Compliance Checklist

**Mandatory:** This checklist must be completed by the author of the PR.

- [ ] **Stable Test Selectors:** I have added `data-testid` attributes to all new or modified interactive UI elements.
- [ ] **Resilience Wrappers:** I have wrapped all external API calls in the standard resilience handler.
- [ ] **Server Actions Protocol:** I have adhered to the Server Actions protocol, ensuring no client-side functions or non-serializable data are passed as arguments.
- [ ] **Zero-Skip Test Policy:** I have confirmed that no tests have been skipped or disabled to force a pass. I have fixed the underlying issues for any failing tests.

## Type of change

Please delete options that are not relevant.

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] This change requires a documentation update

## How Has This Been Tested?

Please describe the tests that you ran to verify your changes. Provide instructions so we can reproduce. Please also list any relevant details for your test configuration.

- [ ] Test A
- [ ] Test B
