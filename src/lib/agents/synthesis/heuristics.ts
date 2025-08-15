/**
 * Multi-Agent PDF Conversion System - Phase 3 Implementation
 * Synthesis Heuristics Engine
 * 
 * This module implements the 6 core heuristics for evaluating conversion quality:
 * 1. Text Quality Score - sentence structure, punctuation, readability
 * 2. Structure Preservation Score - document organization and formatting retention
 * 3. Table Integrity Score - proper table formatting and content preservation
 * 4. List Formatting Score - numbered and bulleted list accuracy
 * 5. Header Hierarchy Score - logical header structure and nesting
 * 6. Link Preservation Score - URL, email, and markdown link retention
 */

export interface HeuristicScore {
  textQuality: number;
  structurePreservation: number;
  tableIntegrity: number;
  listFormatting: number;
  headerHierarchy: number;
  linkPreservation: number;
}

export interface HeuristicAnalysis {
  score: number;
  details: string;
  issues: string[];
}

/**
 * Text Quality Heuristic
 * Evaluates sentence structure, punctuation, readability, and linguistic coherence
 */
export function analyzeTextQuality(markdown: string): HeuristicAnalysis {
  const issues: string[] = [];
  let score = 1.0;

  // Extract actual text content (excluding markdown syntax)
  const textContent = markdown
    .replace(/^#{1,6}\s+/gm, '') // Remove headers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
    .replace(/\*([^*]+)\*/g, '$1') // Remove italic
    .replace(/`([^`]+)`/g, '$1') // Remove inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Remove links
    .replace(/^\s*[-*+]\s+/gm, '') // Remove list markers
    .replace(/^\s*\d+\.\s+/gm, '') // Remove numbered list markers
    .replace(/\|[^|\n]*\|/g, '') // Remove table content
    .trim();

  if (!textContent) {
    return { score: 0, details: 'No readable text content found', issues: ['Empty content'] };
  }

  // Sentence structure analysis
  const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 0);
  let avgSentenceLength = 0;
  
  if (sentences.length === 0) {
    score -= 0.5;
    issues.push('No clear sentence structure');
  } else {
    avgSentenceLength = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length;
    
    // Penalize extremely short or long sentences
    if (avgSentenceLength < 3) {
      score -= 0.2;
      issues.push('Very short sentences detected');
    } else if (avgSentenceLength > 40) {
      score -= 0.15;
      issues.push('Very long sentences detected');
    }
    
    // Check for proper sentence structure (capitalization)
    const properSentences = sentences.filter(s => {
      const trimmed = s.trim();
      return trimmed.length > 0 && /^[A-Z]/.test(trimmed);
    });
    
    const capitalizationRatio = properSentences.length / sentences.length;
    if (capitalizationRatio < 0.5) {
      score -= 0.25; // Increase penalty
      issues.push('Poor sentence capitalization');
    }
  }

  // Punctuation analysis
  const punctuationMatches = textContent.match(/[.!?:;,]/g) || [];
  const wordCount = textContent.split(/\s+/).length;
  const punctuationRatio = punctuationMatches.length / wordCount;
  
  if (punctuationRatio < 0.02) {
    score -= 0.4; // More aggressive penalty for very poor punctuation
    issues.push('Insufficient punctuation');
  } else if (punctuationRatio < 0.03) {
    score -= 0.25;
    issues.push('Insufficient punctuation');
  } else if (punctuationRatio > 0.25) {
    score -= 0.15;
    issues.push('Excessive punctuation');
  }

  // Check for common OCR errors (more aggressive detection)
  const ocrErrorPatterns = [
    /\b[a-z][A-Z]/g, // Mixed case within words
    /[0-9][a-zA-Z]|[a-zA-Z][0-9]/g, // Numbers directly adjacent to letters
    /[^\S\n]{3,}/g, // Multiple non-newline spaces (not including normal line breaks)
    /[^\w\s.!?:;,'"@/-]/g // Unusual characters (allow @, /, - for common uses)
  ];

  ocrErrorPatterns.forEach((pattern, index) => {
    const matches = textContent.match(pattern) || [];
    const errorRate = matches.length / wordCount;
    
    if (errorRate > 0.01) { // More than 1% of words affected
      const penalty = Math.min(0.3, errorRate * 15); // Scale penalty with error rate
      score -= penalty;
      const errorTypes = ['Mixed case errors', 'Number-letter adjacency', 'Spacing issues', 'Unusual characters'];
      issues.push(errorTypes[index]);
    }
  });

  // Readability check (improved Flesch score approximation)
  const avgWordsPerSentence = wordCount / sentences.length;
  
  // Very simple syllable approximation - average English is ~1.4 syllables per word
  const words = textContent.toLowerCase().split(/\s+/);
  const syllableCount = Math.round(words.length * 1.4);
  
  const avgSyllablesPerWord = syllableCount / wordCount;
  const fleschScore = 206.835 - (1.015 * avgWordsPerSentence) - (84.6 * avgSyllablesPerWord);
  
  // Adjust thresholds to be more reasonable for professional documents
  if (fleschScore < 10) {
    score -= 0.15;
    issues.push('Extremely difficult to read');
  } else if (fleschScore < 30) {
    score -= 0.1;
    issues.push('Very difficult to read');
  } else if (fleschScore < 50) {
    score -= 0.05;
    issues.push('Difficult to read');
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    details: `Avg sentence length: ${avgSentenceLength.toFixed(1)} words, Punctuation ratio: ${(punctuationRatio * 100).toFixed(1)}%, Readability: ${fleschScore.toFixed(0)}`,
    issues
  };
}

/**
 * Structure Preservation Heuristic
 * Evaluates document organization, formatting retention, and structural integrity
 */
export function analyzeStructurePreservation(markdown: string): HeuristicAnalysis {
  const issues: string[] = [];
  let score = 1.0;

  // Check for basic markdown structure elements
  const hasHeaders = /^#{1,6}\s+/m.test(markdown);
  const hasParagraphs = /\n\s*\n/.test(markdown);
  const hasFormatting = /(\*\*|__|\*|_|`)/.test(markdown);

  if (!hasHeaders) {
    score -= 0.3;
    issues.push('No headers detected');
  }

  if (!hasParagraphs) {
    score -= 0.2;
    issues.push('Poor paragraph separation');
  }

  if (!hasFormatting) {
    score -= 0.1;
    issues.push('No text formatting preserved');
  }

  // Check for proper spacing and line breaks
  const excessiveNewlines = (markdown.match(/\n{4,}/g) || []).length;
  const totalLines = markdown.split('\n').length;
  
  if (excessiveNewlines > totalLines * 0.1) {
    score -= 0.15;
    issues.push('Excessive blank lines');
  }

  // Check for structured content preservation
  const codeBlocks = (markdown.match(/```[\s\S]*?```/g) || []).length;
  const blockquotes = (markdown.match(/^>\s+/gm) || []).length;
  const horizontalRules = (markdown.match(/^---+$/gm) || []).length;

  const structuralElements = codeBlocks + blockquotes + horizontalRules;
  if (structuralElements > 0) {
    score += 0.1; // Bonus for preserving special structures
  }

  // Check for malformed markdown syntax
  const malformedHeaders = (markdown.match(/^#{7,}/gm) || []).length;
  
  // Better detection of unmatched formatting
  const codeTickCount = (markdown.match(/`/g) || []).length;
  const unmatchedCodeTicks = codeTickCount % 2 !== 0 ? 1 : 0;
  
  // Count ** sequences that should be paired
  const boldMarkCount = (markdown.match(/\*\*/g) || []).length;
  const unmatchedBold = boldMarkCount % 2 !== 0 ? 1 : 0;
  
  // Also check for other unmatched formatting
  const italicMarkCount = (markdown.match(/(?<!\*)\*(?!\*)/g) || []).length;
  const unmatchedItalic = italicMarkCount % 2 !== 0 ? 1 : 0;

  if (malformedHeaders > 0) {
    score -= 0.1;
    issues.push('Malformed headers');
  }

  if (unmatchedCodeTicks > 0) {
    score -= 0.05;
    issues.push('Unmatched code ticks');
  }

  if (unmatchedBold > 0) {
    score -= 0.05;
    issues.push('Unmatched bold formatting');
  }

  if (unmatchedItalic > 0) {
    score -= 0.05;
    issues.push('Unmatched italic formatting');
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    details: `Headers: ${hasHeaders}, Paragraphs: ${hasParagraphs}, Formatting: ${hasFormatting}, Special elements: ${structuralElements}`,
    issues
  };
}

/**
 * Table Integrity Heuristic
 * Evaluates proper table formatting and content preservation
 */
export function analyzeTableIntegrity(markdown: string): HeuristicAnalysis {
  const issues: string[] = [];
  let score = 1.0;

  // Find all potential table structures (improved detection)
  // Split by empty lines and find blocks that contain pipe characters
  const blocks = markdown.split(/\n\s*\n/);
  const tableBlocks = blocks.filter(block => {
    const lines = block.trim().split('\n');
    // A table block should have multiple lines with pipes
    return lines.length > 1 && lines.some(line => line.includes('|'));
  });
  
  if (tableBlocks.length === 0) {
    // No tables found - perfect score unless there should be tables
    const potentialTableIndicators = [
      /\btable\b/i,
      /\brow\b/i,
      /\bcolumn\b/i,
      /\bcell\b/i
    ];
    
    const hasTableIndicators = potentialTableIndicators.some(pattern => pattern.test(markdown));
    if (hasTableIndicators) {
      score = 0.7;
      issues.push('Table indicators found but no tables preserved');
    }
    
    return {
      score,
      details: `No tables found${hasTableIndicators ? ' (but table indicators present)' : ''}`,
      issues
    };
  }

  let totalTables = 0;
  let wellFormedTables = 0;

  tableBlocks.forEach(block => {
    totalTables++;
    const lines = block.trim().split('\n');
    
    // Check for header separator
    const hasHeaderSeparator = lines.some(line => /^\|[\s:|-]*\|$/.test(line));
    if (!hasHeaderSeparator) {
      issues.push('Table missing header separator');
      score -= 0.2;
      // Continue analysis to check for other issues
    }

    // Check column consistency (more robust detection)
    const columnCounts = lines.map(line => {
      // Remove leading/trailing whitespace and split by |
      const trimmedLine = line.trim();
      if (!trimmedLine.startsWith('|') || !trimmedLine.endsWith('|')) {
        return 0; // Malformed table line
      }
      // Count cells between | separators, excluding empty edge segments
      const parts = trimmedLine.split('|');
      return parts.length - 2; // Exclude first and last empty segments
    });

    // Filter out separator lines and malformed lines
    const dataCounts = columnCounts.filter((count, index) => {
      const line = lines[index].trim();
      return count > 0 && !(/^[\|\s:|-]+$/.test(line)); // Not a separator line
    });
    
    if (dataCounts.length === 0) {
      issues.push('Table has no valid data rows');
      score -= 0.2;
      return;
    }

    const consistentColumns = dataCounts.every(count => count === dataCounts[0]);
    if (!consistentColumns) {
      issues.push('Inconsistent column count in table');
      score -= 0.15;
    } else {
      wellFormedTables++;
    }

    // Check for empty cells or malformed content
    const allCells = lines.flatMap(line => 
      line.split('|').filter(cell => cell.trim() !== '')
    );
    
    const emptyCells = allCells.filter(cell => cell.trim() === '').length;
    const emptyCellRatio = emptyCells / allCells.length;
    
    if (emptyCellRatio > 0.3) {
      score -= 0.1;
      issues.push('High ratio of empty table cells');
    }

    // Check for proper alignment markers
    const separatorLine = lines.find(line => /^\|[\s:|-]*\|$/.test(line));
    if (separatorLine) {
      const hasAlignment = /[:-]/.test(separatorLine);
      if (!hasAlignment) {
        score -= 0.05;
        issues.push('Table missing alignment markers');
      }
    }
  });

  const tableQualityRatio = wellFormedTables / totalTables;
  score *= tableQualityRatio;

  // Ensure score is within bounds
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    details: `${totalTables} tables found, ${wellFormedTables} well-formed (${(tableQualityRatio * 100).toFixed(0)}%)`,
    issues
  };
}

/**
 * List Formatting Heuristic
 * Evaluates numbered and bulleted list accuracy
 */
export function analyzeListFormatting(markdown: string): HeuristicAnalysis {
  const issues: string[] = [];
  let score = 1.0;

  // Find unordered lists
  const unorderedLists = markdown.match(/^(\s*)[-*+]\s+.+$/gm) || [];
  
  // Find ordered lists
  const orderedLists = markdown.match(/^(\s*)\d+\.\s+.+$/gm) || [];

  const totalLists = unorderedLists.length + orderedLists.length;

  if (totalLists === 0) {
    // Check if there should be lists
    const listIndicators = [
      /\bfirst\b.*\bsecond\b.*\bthird\b/i,
      /\b1\.\s*[A-Z]/,
      /\b2\.\s*[A-Z]/,
      /bullet/i,
      /\bitem\b/i
    ];
    
    const hasListIndicators = listIndicators.some(pattern => pattern.test(markdown));
    if (hasListIndicators) {
      score = 0.6;
      issues.push('List indicators found but no lists preserved');
    }

    return {
      score,
      details: `No lists found${hasListIndicators ? ' (but list indicators present)' : ''}`,
      issues
    };
  }

  // Analyze unordered lists
  if (unorderedLists.length > 0) {
    const inconsistentMarkers = new Set(
      unorderedLists.map(line => line.match(/^\s*([-*+])/)?.[1])
    ).size;
    
    if (inconsistentMarkers > 1) {
      score -= 0.1;
      issues.push('Inconsistent unordered list markers');
    }

    // Check for proper indentation (be more forgiving)
    const indentLevels = unorderedLists.map(line => {
      const match = line.match(/^(\s*)[-*+]/);
      return match ? match[1].length : 0;
    });

    const hasNestedLists = indentLevels.some(level => level > 0);
    
    // Be more forgiving - accept various indentation styles
    const properNesting = indentLevels.every(level => 
      level === 0 || level >= 2 // Allow 0 indent or at least 2 spaces
    );

    if (hasNestedLists && !properNesting) {
      score -= 0.1; // Reduce penalty
      issues.push('Improper list nesting indentation');
    }
  }

  // Analyze ordered lists
  if (orderedLists.length > 0) {
    // Check for sequential numbering
    const numbers = orderedLists.map(line => {
      const match = line.match(/^(\s*)(\d+)\./);
      return match ? parseInt(match[2]) : 0;
    });

    const isSequential = numbers.every((num, index) => {
      if (index === 0) return num === 1;
      return num === numbers[index - 1] + 1 || num === 1; // Allow restart at 1 for new lists
    });

    if (!isSequential) {
      score -= 0.2;
      issues.push('Non-sequential ordered list numbering');
    }

    // Check for consistent formatting
    const formats = orderedLists.map(line => {
      const match = line.match(/^\s*\d+(\.\s+)/);
      return match ? match[1] : '';
    });

    const consistentFormat = formats.every(format => format === formats[0]);
    if (!consistentFormat) {
      score -= 0.1;
      issues.push('Inconsistent ordered list formatting');
    }
  }

  // Check for mixed list types (potential conversion errors)
  const listBlocks = markdown.split(/\n\s*\n/);
  listBlocks.forEach(block => {
    const hasUnordered = /^\s*[-*+]\s+/m.test(block);
    const hasOrdered = /^\s*\d+\.\s+/m.test(block);
    
    if (hasUnordered && hasOrdered) {
      score -= 0.1;
      issues.push('Mixed list types in same block');
    }
  });

  // Ensure score is within bounds
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    details: `${unorderedLists.length} unordered lists, ${orderedLists.length} ordered lists`,
    issues
  };
}

/**
 * Header Hierarchy Heuristic
 * Evaluates logical header structure and nesting
 */
export function analyzeHeaderHierarchy(markdown: string): HeuristicAnalysis {
  const issues: string[] = [];
  let score = 1.0;

  // Extract all headers with their levels
  const headerMatches = [...markdown.matchAll(/^(#{1,6})\s+(.+)$/gm)];
  
  // Check for malformed headers (>6 levels) separately
  const malformedHeaders = [...markdown.matchAll(/^(#{7,})\s+(.+)$/gm)];
  
  if (headerMatches.length === 0) {
    // Check if document should have headers
    const documentLength = markdown.split(/\s+/).length;
    if (documentLength > 200) {
      score = 0.5;
      issues.push('Long document without headers');
    } else if (documentLength > 50) {
      // Medium length documents should have some structure
      score = 0.7;
      issues.push('Document could benefit from headers');
    } else if (documentLength > 10) {
      // Very short documents without headers should still be penalized slightly
      score = 0.6; 
    }
    
    return {
      score,
      details: 'No headers found',
      issues
    };
  }

  const headers = headerMatches.map(match => ({
    level: match[1].length,
    text: match[2].trim(),
    position: match.index || 0
  }));

  // Check for logical hierarchy progression
  let currentLevel = 0;
  headers.forEach((header, index) => {
    if (index === 0) {
      // First header should ideally be H1, but H2 is acceptable
      if (header.level > 2) {
        score -= 0.2; // More aggressive penalty
        issues.push('Document starts with deep header level');
      }
      currentLevel = header.level;
      return;
    }

    const levelJump = header.level - currentLevel;
    
    // Check for level skipping (e.g., H1 -> H3) - only when going deeper
    if (levelJump > 1) {
      score -= 0.15;
      issues.push(`Header level skip detected (H${currentLevel} to H${header.level})`);
    }
    
    // Update current level for next iteration
    currentLevel = header.level;
  });

  // Check for proper header content
  headers.forEach(header => {
    // Headers should not be too short or too long
    if (header.text.length < 2) {
      score -= 0.05;
      issues.push('Very short header detected');
    } else if (header.text.length > 100) {
      score -= 0.05;
      issues.push('Very long header detected');
    }

    // Headers should not contain excessive formatting
    const formattingChars = (header.text.match(/[*_`]/g) || []).length;
    if (formattingChars > header.text.length * 0.3) {
      score -= 0.05;
      issues.push('Header with excessive formatting');
    }

    // Headers should not end with punctuation (except ? or !)
    if (/[.,:;]$/.test(header.text)) {
      score -= 0.03;
      issues.push('Header ending with inappropriate punctuation');
    }
  });

  // Check for balanced distribution
  const levelCounts = new Array(7).fill(0);
  headers.forEach(header => levelCounts[header.level]++);
  
  const usedLevels = levelCounts.filter(count => count > 0).length;
  const totalHeaders = headers.length;
  
  // Penalize if using too many header levels for a short document
  if (usedLevels > 4 && totalHeaders < 10) {
    score -= 0.1;
    issues.push('Too many header levels for document size');
  }

  // Check for malformed headers first
  if (malformedHeaders.length > 0) {
    score -= 0.1;
    issues.push('Malformed headers');
  }
  
  // Check for proper semantic structure
  const h1Count = levelCounts[1];
  if (h1Count > 1 && totalHeaders >= 5) { // Changed > to >=
    // Multiple H1s might indicate poor structure
    score -= 0.05;
    issues.push('Multiple H1 headers detected');
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    details: `${totalHeaders} headers across ${usedLevels} levels (H1: ${h1Count}, H2: ${levelCounts[2]}, H3: ${levelCounts[3]})`,
    issues
  };
}

/**
 * Link Preservation Heuristic
 * Evaluates URL, email, and markdown link retention
 */
export function analyzeLinkPreservation(markdown: string): HeuristicAnalysis {
  const issues: string[] = [];
  let score = 1.0;

  // Find different types of links
  const markdownLinks = [...markdown.matchAll(/\[([^\]]*)\]\(([^)]*)\)/g)];
  const autoLinks = [...markdown.matchAll(/<(https?:\/\/[^>]+)>/g)];
  const plainUrls = [...markdown.matchAll(/https?:\/\/[^\s<>"\]]+/g)];
  const wwwUrls = [...markdown.matchAll(/www\.[^\s<>"\]]+/g)]; // Add www URLs
  const emailLinks = [...markdown.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g)];

  const totalLinks = markdownLinks.length + autoLinks.length + plainUrls.length + wwwUrls.length + emailLinks.length;

  if (totalLinks === 0) {
    // Check for link indicators that suggest links should exist
    const linkIndicators = [
      /\bwww\./i,
      /\bhttp\b/i,
      /\burl\b/i,
      /\blink\b/i,
      /\bwebsite\b/i,
      /\bemail\b/i,
      /\b@\w+\./
    ];

    const hasLinkIndicators = linkIndicators.some(pattern => pattern.test(markdown));
    if (hasLinkIndicators) {
      score = 0.6;
      issues.push('Link indicators found but no links preserved');
    }

    return {
      score,
      details: `No links found${hasLinkIndicators ? ' (but link indicators present)' : ''}`,
      issues
    };
  }

  // Analyze markdown links quality
  markdownLinks.forEach(match => {
    const linkText = match[1];
    const url = match[2];

    // Check for empty link text
    if (!linkText.trim()) {
      score -= 0.1;
      issues.push('Empty link text detected');
    }

    // Check for malformed URLs
    if (!url.trim()) {
      score -= 0.2; // More aggressive penalty
      issues.push('Empty URL in markdown link');
    } else if (!/^(https?:\/\/|mailto:|#|\/)/i.test(url)) {
      score -= 0.1; // Increase penalty
      issues.push('Potentially malformed URL scheme');
    }

    // Check for link text quality
    if (linkText === url) {
      score -= 0.03;
      issues.push('Link text same as URL (missed opportunity for descriptive text)');
    }

    // Check for overly generic link text
    const genericTexts = ['click here', 'here', 'link', 'this', 'read more'];
    if (genericTexts.includes(linkText.toLowerCase().trim())) {
      score -= 0.02;
      issues.push('Generic link text detected');
    }
  });

  // Validate URL formats
  const allUrls = [
    ...markdownLinks.map(match => match[2]),
    ...autoLinks.map(match => match[1]),
    ...plainUrls.map(match => match[0]),
    ...wwwUrls.map(match => match[0])
  ];

  allUrls.forEach(url => {
    // Check for broken URL patterns
    if (/\s/.test(url)) {
      score -= 0.2; // Even more aggressive penalty
      issues.push('URL contains spaces');
    }

    if (/[<>]/.test(url)) {
      score -= 0.05;
      issues.push('URL contains invalid characters');
    }

    // Check for incomplete URLs
    if (url.endsWith('...') || url.includes('..')) {
      score -= 0.2; // Even more aggressive penalty
      issues.push('Truncated or incomplete URL detected');
    }
  });

  // Validate email formats
  emailLinks.forEach(match => {
    const email = match[0];
    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      score -= 0.05;
      issues.push('Malformed email address');
    }
  });

  // Check for link density (too many links might indicate over-linking or spam)
  const wordCount = markdown.split(/\s+/).length;
  const linkDensity = totalLinks / wordCount;
  
  if (linkDensity > 0.1) { // More than 10% of words are links
    score -= 0.1;
    issues.push('Very high link density detected');
  }

  // Bonus for proper markdown link formatting vs plain URLs
  const properMarkdownRatio = markdownLinks.length / (plainUrls.length + markdownLinks.length || 1);
  if (properMarkdownRatio > 0.7) {
    score = Math.min(1, score + 0.05);
  }

  // Ensure score is within bounds
  score = Math.max(0, Math.min(1, score));

  return {
    score,
    details: `${markdownLinks.length} markdown links, ${autoLinks.length} auto-links, ${plainUrls.length} plain URLs, ${wwwUrls.length} www URLs, ${emailLinks.length} emails`,
    issues
  };
}

/**
 * Calculate comprehensive heuristic scores for a conversion result
 */
export function calculateHeuristicScores(markdown: string): HeuristicScore {
  return {
    textQuality: analyzeTextQuality(markdown).score,
    structurePreservation: analyzeStructurePreservation(markdown).score,
    tableIntegrity: analyzeTableIntegrity(markdown).score,
    listFormatting: analyzeListFormatting(markdown).score,
    headerHierarchy: analyzeHeaderHierarchy(markdown).score,
    linkPreservation: analyzeLinkPreservation(markdown).score
  };
}

/**
 * Get detailed analysis for all heuristics
 */
export function getDetailedHeuristicAnalysis(markdown: string) {
  return {
    textQuality: analyzeTextQuality(markdown),
    structurePreservation: analyzeStructurePreservation(markdown),
    tableIntegrity: analyzeTableIntegrity(markdown),
    listFormatting: analyzeListFormatting(markdown),
    headerHierarchy: analyzeHeaderHierarchy(markdown),
    linkPreservation: analyzeLinkPreservation(markdown)
  };
}