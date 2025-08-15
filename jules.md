JULES Protocol: Thunderbird-ESQ Engineering Standards
1. Introduction: A Commitment to Disciplined Engineering
This document, codenamed JULES (Joint Understanding of Lasting Engineering Standards), serves as the non-negotiable protocol for all development on the Thunderbird-ESQ project. Our system recently experienced a catastrophic failure due to architectural drift—a direct result of neglecting our own engineering standards. This protocol is our commitment to rectifying that failure and ensuring it never happens again.

Adherence to these standards is not optional. This is the blueprint for building a resilient, stable, and production-hardened application. Every developer on this project is expected to know, understand, and enforce these principles in every contribution they make.

2. Core Principles: The Foundation of Our Work
These are the foundational rules that govern our engineering philosophy.

We Do Not Ship Broken Code. Our first priority is stability. Features are secondary to a functioning application.

We Do Not Disable Tests. A failing test is a signal of a real problem. We fix the underlying problem, not silence the signal. Disabling, skipping, or ignoring a failing test to force a merge is a direct violation of this protocol.

We Build for Resilience. We assume external services will fail. Every network call, API integration, and database transaction must be wrapped in robust error handling, retry logic, and graceful degradation patterns.

We Maintain a Single Source of Truth. We avoid architectural drift by establishing and enforcing canonical sources of truth for our data models, state machines, and API contracts.

Documentation is Law. The architectural standards documented in this and other core project documents are not suggestions; they are enforceable rules that guide our work.

3. The Development Workflow: Our Standard Operating Procedure
All code changes to this repository must follow this process.

Branching: All work must be done on a feature branch, created from the develop branch. Direct commits to main or develop are strictly prohibited.

Pull Requests (PRs): All code must be submitted via a Pull Request targeting the develop branch.

Mandatory CI Checks: A PR cannot be merged unless all mandatory CI checks pass. This includes, at a minimum:

Linting and Type Checking

Unit and Integration Tests

100% of End-to-End (E2E) Tests

PR Template Compliance: The PR description must fully complete the provided template, including the mandatory checklist which requires the author to self-verify adherence to our architectural standards.

Code Review: All PRs must be reviewed and approved by at least one other member of the team before merging.

4. Architectural Standards: Non-Negotiable Technical Rules
Stable Test Selectors: All interactive or state-dependent UI elements must have a stable data-testid attribute. This creates a durable contract for our E2E tests and is not optional.

Server Actions Protocol: Client-side functions or other non-serializable data types must not be passed as arguments to Next.js Server Actions. Long-running server tasks must be decoupled from client-side UI updates, using client-side state simulation for user feedback.

Resilience Wrappers: Every external API call must be wrapped in the project's standard resilience handler, which includes exponential backoff, jitter, and fallback mechanisms as defined in our External API Resilience Strategy.

Data Integrity: All data persisted to the database must conform to the expected schema type. For example, vector embeddings must be stored as raw arrays, not JSON strings.

5. Testing and Quality Assurance: Our Automated Quality Gate
Our CI pipeline is the ultimate guardian of our application's stability.

Zero-Skip Policy: The CI pipeline is configured to fail automatically if it detects that any tests were skipped. This is a technical enforcement of our "We Do Not Disable Tests" principle.

E2E Suite is Sacred: The E2E test suite is our primary tool for validating the health of the entire system. These tests must be maintained, kept up-to-date, and treated as a critical part of the application's codebase.

Continuous Improvement: We are committed to continuously improving our test coverage and the sophistication of our automated validation processes.

6. Conclusion: The Way Forward
The period of architectural drift is over. By embedding these principles into our daily workflow and enforcing them with automated tools, we will restore the Thunderbird-ESQ project to a state of stability and build a foundation for sustainable, high-quality development moving forward. This is our shared commitment to excellence.
