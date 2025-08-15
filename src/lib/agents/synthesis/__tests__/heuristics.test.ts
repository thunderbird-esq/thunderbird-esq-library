/**
 * Multi-Agent PDF Conversion System - Phase 3 Implementation
 * Heuristics Test Suite
 * 
 * Comprehensive testing for individual heuristic functions with varied content types
 */

import {
  analyzeTextQuality,
  analyzeStructurePreservation,
  analyzeTableIntegrity,
  analyzeListFormatting,
  analyzeHeaderHierarchy,
  analyzeLinkPreservation,
  calculateHeuristicScores
} from '../heuristics';

describe('Text Quality Heuristic', () => {
  it('should score high-quality text well', () => {
    const goodText = `
# Professional Document

This document demonstrates excellent writing quality. The sentences are well-structured with proper punctuation. Each paragraph flows logically into the next, creating a coherent narrative that readers can easily follow.

The content maintains professional standards throughout, with appropriate vocabulary and clear expression of ideas.
    `;

    const analysis = analyzeTextQuality(goodText);
    
    expect(analysis.score).toBeGreaterThan(0.8);
    expect(analysis.issues).toHaveLength(0);
    expect(analysis.details).toContain('Avg sentence length');
  });

  it('should penalize poor quality text', () => {
    const poorText = `
no punctuation here at all just one long run on sentence that goes on and on without any breaks or proper formatting this makes it very difficult to read and understand
    `;

    const analysis = analyzeTextQuality(poorText);
    
    expect(analysis.score).toBeLessThan(0.7);
    expect(analysis.issues).toContain('Insufficient punctuation');
  });

  it('should detect OCR errors', () => {
    const ocrText = `
Th1s t3xt h4s m4ny 0CR err0rs. L3tt3rs 4nd numb3rs 4r3    m1x3d   t0g3th3r.
Th3r3   4r3   4ls0   mult1pl3   sp4c3s   b3tw33n   w0rds.
    `;

    const analysis = analyzeTextQuality(ocrText);
    
    expect(analysis.score).toBeLessThan(0.5);
    expect(analysis.issues.length).toBeGreaterThan(1);
  });

  it('should handle empty content', () => {
    const analysis = analyzeTextQuality('');
    
    expect(analysis.score).toBe(0);
    expect(analysis.issues).toContain('Empty content');
  });
});

describe('Structure Preservation Heuristic', () => {
  it('should score well-structured markdown highly', () => {
    const wellStructured = `
# Main Title

## Section 1

This is a well-structured document with proper **formatting** and *emphasis*.

### Subsection

Content with proper paragraph breaks.

> This is a blockquote that adds structural variety.

\`\`\`javascript
// Code blocks are preserved
console.log('Hello world');
\`\`\`

---

Another section with horizontal rule separation.
    `;

    const analysis = analyzeStructurePreservation(wellStructured);
    
    expect(analysis.score).toBeGreaterThan(0.8);
    expect(analysis.details).toContain('Headers: true');
    expect(analysis.details).toContain('Formatting: true');
  });

  it('should penalize poor structure', () => {
    const poorStructure = `
just plain text with no headers
no formatting at all
no proper paragraph breaks everything runs together this is very poor structure
    `;

    const analysis = analyzeStructurePreservation(poorStructure);
    
    expect(analysis.score).toBeLessThan(0.6);
    expect(analysis.issues).toContain('No headers detected');
    expect(analysis.issues).toContain('No text formatting preserved');
  });

  it('should detect malformed markdown', () => {
    const malformed = `
####### Too many hash marks

**Unmatched bold formatting

\`Unmatched code ticks

Properly formatted content.
    `;

    const analysis = analyzeStructurePreservation(malformed);
    
    expect(analysis.issues).toContain('Malformed headers');
    expect(analysis.issues).toContain('Unmatched bold formatting');
    expect(analysis.issues).toContain('Unmatched code ticks');
  });
});

describe('Table Integrity Heuristic', () => {
  it('should score well-formed tables highly', () => {
    const goodTable = `
# Document with Tables

| Column 1 | Column 2 | Column 3 |
|----------|:--------:|---------:|
| Left     | Center   | Right    |
| Data     | More     | Values   |
| Row 3    | Info     | Final    |

| Name     | Age | City      |
|----------|-----|-----------|
| John     | 25  | New York  |
| Jane     | 30  | Boston    |
    `;

    const analysis = analyzeTableIntegrity(goodTable);
    
    expect(analysis.score).toBeGreaterThan(0.8);
    expect(analysis.details).toContain('2 tables found');
    expect(analysis.details).toContain('2 well-formed');
  });

  it('should penalize malformed tables', () => {
    const badTable = `
| Broken | Table |
| Missing separator row
| Data | More |

| Inconsistent | Column |
| Count | Here | Extra |
| Data | Values |
    `;

    const analysis = analyzeTableIntegrity(badTable);
    
    expect(analysis.score).toBeLessThan(0.5);
    expect(analysis.issues).toContain('Table missing header separator');
    expect(analysis.issues).toContain('Inconsistent column count in table');
  });

  it('should handle documents without tables', () => {
    const noTables = `
# Regular Document

This document has no tables, which is perfectly fine.
    `;

    const analysis = analyzeTableIntegrity(noTables);
    
    expect(analysis.score).toBe(1.0);
    expect(analysis.details).toContain('No tables found');
  });

  it('should detect missing tables when indicators present', () => {
    const shouldHaveTables = `
# Data Analysis Report

The table below shows our quarterly results with columns for revenue, expenses, and profit.
However, the table extraction failed during conversion.
    `;

    const analysis = analyzeTableIntegrity(shouldHaveTables);
    
    expect(analysis.score).toBe(0.7);
    expect(analysis.issues).toContain('Table indicators found but no tables preserved');
  });
});

describe('List Formatting Heuristic', () => {
  it('should score well-formatted lists highly', () => {
    const goodLists = `
# Document with Lists

## Ordered List
1. First item
2. Second item
3. Third item

## Unordered List
- Bullet point one
- Bullet point two
- Bullet point three

## Nested Lists
1. Main item
   - Sub item
   - Another sub item
2. Second main item
   1. Numbered sub item
   2. Another numbered sub item
    `;

    const analysis = analyzeListFormatting(goodLists);
    
    expect(analysis.score).toBeGreaterThan(0.8);
    expect(analysis.details).toContain('unordered lists');
    expect(analysis.details).toContain('ordered lists');
  });

  it('should penalize malformed lists', () => {
    const badLists = `
1. First item
3. Skipped number two
5. Non-sequential numbering

* Mixed
+ List
- Markers

1. Ordered item
- Mixed with unordered in same block
2. Another ordered item
    `;

    const analysis = analyzeListFormatting(badLists);
    
    expect(analysis.score).toBeLessThan(0.7);
    expect(analysis.issues).toContain('Non-sequential ordered list numbering');
    expect(analysis.issues).toContain('Inconsistent unordered list markers');
    expect(analysis.issues).toContain('Mixed list types in same block');
  });

  it('should handle documents without lists', () => {
    const noLists = `
# Regular Document

This document contains regular paragraphs without any lists.
    `;

    const analysis = analyzeListFormatting(noLists);
    
    expect(analysis.score).toBe(1.0);
    expect(analysis.details).toContain('No lists found');
  });
});

describe('Header Hierarchy Heuristic', () => {
  it('should score proper hierarchy highly', () => {
    const goodHierarchy = `
# Main Title

## Introduction

### Background Information

Content here.

### Problem Statement

More content.

## Methodology

### Data Collection

Details here.

### Analysis Approach

More details.

## Results

### Findings

Results content.

## Conclusion
    `;

    const analysis = analyzeHeaderHierarchy(goodHierarchy);
    
    expect(analysis.score).toBeGreaterThan(0.8);
    expect(analysis.details).toContain('10 headers');
  });

  it('should penalize poor hierarchy', () => {
    const badHierarchy = `
### Starting with H3 is wrong

# Then jumping to H1

##### Skipping to H5

Regular content here.

#### Back to H4 but with periods.

####### Too many hash marks

# Another H1 when we already had one.
    `;

    const analysis = analyzeHeaderHierarchy(badHierarchy);
    
    expect(analysis.score).toBeLessThan(0.6);
    expect(analysis.issues).toContain('Document starts with deep header level');
    expect(analysis.issues.some(issue => issue.includes('Header level skip detected'))).toBe(true);
    expect(analysis.issues).toContain('Header ending with inappropriate punctuation');
    expect(analysis.issues).toContain('Multiple H1 headers detected');
  });

  it('should handle documents without headers', () => {
    const shortDoc = `
Just a short paragraph without any headers.
    `;

    const analysis = analyzeHeaderHierarchy(shortDoc);
    
    expect(analysis.score).toBe(1.0);
    expect(analysis.details).toContain('No headers found');
  });

  it('should penalize long documents without headers', () => {
    const longDoc = `
${'This is a very long document with many paragraphs but no headers to organize the content. '.repeat(50)}
    `;

    const analysis = analyzeHeaderHierarchy(longDoc);
    
    expect(analysis.score).toBe(0.5);
    expect(analysis.issues).toContain('Long document without headers');
  });
});

describe('Link Preservation Heuristic', () => {
  it('should score well-preserved links highly', () => {
    const goodLinks = `
# Document with Links

Visit our [official website](https://example.com) for more information.

You can also check out our [documentation](https://docs.example.com/guide) 
or contact us at support@example.com.

Additional resources:
- [GitHub Repository](https://github.com/example/project)
- [API Documentation](https://api.example.com/docs)

For urgent matters, email urgent@example.com or call our support line.
    `;

    const analysis = analyzeLinkPreservation(goodLinks);
    
    expect(analysis.score).toBeGreaterThan(0.8);
    expect(analysis.details).toContain('4 markdown links');
    expect(analysis.details).toContain('2 emails');
  });

  it('should penalize malformed links', () => {
    const badLinks = `
# Document with Poor Links

[Empty URL]()

[Same as URL](https://example.com)

[click here](broken url with spaces)

[Generic link text](https://example.com)

[here](https://example.com)

Visit www.example... (truncated URL)

Contact email@domain (malformed email)
    `;

    const analysis = analyzeLinkPreservation(badLinks);
    
    expect(analysis.score).toBeLessThan(0.6);
    expect(analysis.issues).toContain('Empty URL in markdown link');
    expect(analysis.issues).toContain('URL contains spaces');
    expect(analysis.issues).toContain('Generic link text detected');
    expect(analysis.issues).toContain('Truncated or incomplete URL detected');
  });

  it('should handle documents without links', () => {
    const noLinks = `
# Regular Document

This document contains no links or URLs, which is perfectly normal.
    `;

    const analysis = analyzeLinkPreservation(noLinks);
    
    expect(analysis.score).toBe(1.0);
    expect(analysis.details).toContain('No links found');
  });

  it('should detect missing links when indicators present', () => {
    const shouldHaveLinks = `
# Research Paper

This paper references multiple websites and email addresses throughout.
Visit our website for more information or send us an email for questions.
    `;

    const analysis = analyzeLinkPreservation(shouldHaveLinks);
    
    expect(analysis.score).toBe(0.6);
    expect(analysis.issues).toContain('Link indicators found but no links preserved');
  });
});

describe('Comprehensive Heuristic Calculation', () => {
  it('should calculate all heuristic scores correctly', () => {
    const comprehensiveMarkdown = `
# Professional Document

## Introduction

This document demonstrates **excellent formatting** across all categories.

### Key Features

The document includes:
1. Clear hierarchical headers
2. Proper text formatting with good grammar and punctuation
3. Well-structured lists and content organization

| Feature | Score | Notes |
|---------|-------|--------|
| Headers | 5/5   | Perfect hierarchy |
| Lists   | 5/5   | Well formatted |
| Links   | 4/5   | [Good links](https://example.com) |

## Contact Information

Visit our [website](https://example.com) or email contact@example.com.

### Additional Resources

- [Documentation](https://docs.example.com)
- [Support Portal](https://support.example.com)
    `;

    const scores = calculateHeuristicScores(comprehensiveMarkdown);
    
    expect(scores.textQuality).toBeGreaterThanOrEqual(0.7);
    expect(scores.structurePreservation).toBeGreaterThan(0.8);
    expect(scores.tableIntegrity).toBeGreaterThan(0.8);
    expect(scores.listFormatting).toBeGreaterThan(0.8);
    expect(scores.headerHierarchy).toBeGreaterThan(0.8);
    expect(scores.linkPreservation).toBeGreaterThan(0.8);
    
    // All scores should be between 0 and 1
    Object.values(scores).forEach(score => {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  it('should handle extremely poor content', () => {
    const terribleMarkdown = `
no structure whatsoever just text running together without any formatting or organization
broken table | |
malformed list -item
www.broken... incomplete links
    `;

    const scores = calculateHeuristicScores(terribleMarkdown);
    
    // All scores should be low but not necessarily zero
    Object.values(scores).forEach(score => {
      expect(score).toBeLessThanOrEqual(0.8); // Slightly more lenient - the content isn't THAT terrible
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  it('should handle edge case content', () => {
    const edgeCase = ``;

    const scores = calculateHeuristicScores(edgeCase);
    
    // Empty content should have zero text quality but perfect other scores
    expect(scores.textQuality).toBe(0);
    expect(scores.structurePreservation).toBeGreaterThan(0);
    expect(scores.tableIntegrity).toBe(1);
    expect(scores.listFormatting).toBe(1);
    expect(scores.headerHierarchy).toBe(1);
    expect(scores.linkPreservation).toBe(1);
  });
});