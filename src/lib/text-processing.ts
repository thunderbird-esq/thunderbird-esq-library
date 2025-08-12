/**
 * Robust OCR Error Correction System for PDF Text Processing
 * 
 * This module provides deterministic, production-ready OCR error correction
 * without relying on AI services. It handles common OCR misrecognitions,
 * word boundary issues, hyphenation problems, and header/footer removal.
 * 
 * Designed to replace unreliable AI-based text cleanup in the PDF processing pipeline.
 */

// Common OCR character substitution errors (bidirectional mapping)
const OCR_CHARACTER_CORRECTIONS = new Map([
  // Letter-number confusions
  ['0', 'O'], ['O', '0'],
  ['1', 'I'], ['I', '1'], ['1', 'l'], ['l', '1'],
  ['5', 'S'], ['S', '5'],
  ['6', 'G'], ['G', '6'],
  ['8', 'B'], ['B', '8'],
  
  // Common letter confusions
  ['rn', 'm'],
  ['cl', 'd'],
  ['li', 'h'],
  ['vv', 'w'],
  ['nn', 'n'], 
  ['ii', 'i'],
  
  // Punctuation issues
  ['\u2018', "'"], ['\u2019', "'"], ['\u201C', '"'], ['\u201D', '"'],
  ['–', '-'], ['—', '-'], ['…', '...'],
  
  // Space-related issues
  ['  ', ' '], ['   ', ' '], ['    ', ' '],
]);

// Common header/footer patterns that should be removed
const HEADER_FOOTER_PATTERNS = [
  // Page numbers
  /^[\s]*\d+[\s]*$/gm,
  /^[\s]*Page\s+\d+[\s]*$/gim,
  /^[\s]*\d+\s*\/\s*\d+[\s]*$/gm,
  
  // Common headers
  /^[\s]*Chapter\s+\d+[\s]*$/gim,
  /^[\s]*CHAPTER\s+[IVXLCDM]+[\s]*$/gim,
  /^[\s]*Table\s+of\s+Contents[\s]*$/gim,
  /^[\s]*INDEX[\s]*$/gim,
  /^[\s]*APPENDIX[\s\w]*$/gim,
  
  // Footers with URLs, copyright, dates
  /^[\s]*©.*$/gm,
  /^[\s]*Copyright.*$/gim,
  /^[\s]*www\..*$/gm,
  /^[\s]*http[s]?:\/\/.*$/gm,
  /^[\s]*\d{4}[-\/]\d{1,2}[-\/]\d{1,2}[\s]*$/gm,
  /^[\s]*\d{1,2}[-\/]\d{1,2}[-\/]\d{4}[\s]*$/gm,
  
  // Document metadata footers
  /^[\s]*Draft[\s\w\d]*$/gim,
  /^[\s]*Version\s+[\d\.]+s]*$/gim,
  /^[\s]*Rev\.\s+[\d\.]+s]*$/gim,
  /^[\s]*Revised\s+\d{1,2}\/\d{1,2}\/\d{4}[\s]*$/gim,
];

// Words that are commonly split incorrectly by OCR
const COMMON_COMPOUND_WORDS = [
  'another', 'something', 'someone', 'somewhere', 'anything', 'anyone', 'anywhere',
  'everything', 'everyone', 'everywhere', 'nothing', 'nowhere', 'within',
  'without', 'throughout', 'therefore', 'however', 'moreover', 'furthermore',
  'nevertheless', 'nonetheless', 'meanwhile', 'otherwise', 'likewise',
  'understand', 'background', 'classroom', 'database', 'feedback', 'framework',
  'handbook', 'headline', 'homework', 'keyboard', 'landscape', 'meanwhile',
  'network', 'outline', 'overview', 'password', 'software', 'somewhere',
  'upgrade', 'website', 'workshop', 'workplace', 'worldwide'
];

// Business and legal terms that OCR often mangles
const BUSINESS_LEGAL_TERMS = new Map([
  ['coinpany', 'company'],
  ['coinpanies', 'companies'],
  ['govermnent', 'government'],
  ['governinent', 'government'],
  ['departnient', 'department'],
  ['agreenient', 'agreement'],
  ['managenient', 'management'],
  ['requirenient', 'requirement'],
  ['developnient', 'development'],
  ['improvenient', 'improvement'],
  ['establishnient', 'establishment'],
  ['achievenient', 'achievement'],
  ['announcenient', 'announcement'],
  ['commiinication', 'communication'],
  ['recoinmendation', 'recommendation'],
  ['infonmation', 'information'],
  ['docuinent', 'document'],
  ['instrunient', 'instrument'],
  ['eleinent', 'element'],
  ['niovement', 'movement'],
  ['paynient', 'payment'],
  ['treatnient', 'treatment'],
  ['stateinert', 'statement'],
]);

/**
 * Fixes hyphenated words that were broken across line breaks.
 * This is one of the most common OCR issues in PDF extraction.
 */
function fixHyphenatedWords(text: string): string {
  // Handle hyphenated words across line breaks (word- \n word -> word)
  return text
    .replace(/(\w+)-\s*\n\s*(\w+)/g, (match, firstPart, secondPart) => {
      // Check if this creates a valid compound word
      const combined = firstPart.toLowerCase() + secondPart.toLowerCase();
      if (COMMON_COMPOUND_WORDS.includes(combined)) {
        return combined;
      }
      // For other cases, just combine without hyphen
      return firstPart + secondPart;
    })
    // Handle cases where OCR inserted extra spaces around hyphens
    .replace(/(\w+)\s*-\s*(\w+)/g, '$1-$2')
    // Fix standalone hyphens that should be dashes
    .replace(/\s-\s/g, ' – ');
}

// Caches to store the compiled regex and lookup maps, so they're only built once.
let charRegex: RegExp | null = null;
const charReplacerMap = new Map<string, string>();

let termRegex: RegExp | null = null;
const termReplacerMap = new Map<string, string>();

// Function to escape regex special characters.
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Corrects common OCR character recognition errors.
 * This function is performance-optimized to run in O(n) time. It builds two
 * comprehensive regular expressions (one for character swaps, one for term swaps)
 * and uses a replacer function to perform all substitutions in two passes.
 */
function correctCharacterErrors(text: string): string {
  // Initialize character correction regex and map on first run
  if (!charRegex) {
    const charPatterns = Array.from(OCR_CHARACTER_CORRECTIONS.keys());
    for (const [wrong, right] of OCR_CHARACTER_CORRECTIONS) {
      charReplacerMap.set(wrong, right);
    }
    charRegex = new RegExp(charPatterns.map(escapeRegex).join('|'), 'g');
  }

  // Initialize business term correction regex and map on first run
  if (!termRegex) {
    const termPatterns = Array.from(BUSINESS_LEGAL_TERMS.keys());
    for (const [wrong, right] of BUSINESS_LEGAL_TERMS) {
      // Store lowercase for case-insensitive matching
      termReplacerMap.set(wrong.toLowerCase(), right);
    }
    termRegex = new RegExp(`\\b(${termPatterns.map(escapeRegex).join('|')})\\b`, 'gi');
  }

  // First pass: Apply case-sensitive character corrections
  let corrected = text.replace(charRegex, (match) => {
    return charReplacerMap.get(match) || match;
  });

  // Second pass: Apply case-insensitive, whole-word business term corrections
  corrected = corrected.replace(termRegex, (match) => {
    // Look up the lowercase version of the match
    return termReplacerMap.get(match.toLowerCase()) || match;
  });

  return corrected;
}

/**
 * Fixes word boundary and spacing issues common in OCR output.
 */
function fixWordBoundaries(text: string): string {
  return text
    // Fix missing spaces after periods, commas, colons, semicolons
    .replace(/([.,:;])([A-Za-z])/g, '$1 $2')
    // Fix missing spaces before opening parentheses and brackets
    .replace(/(\w)([([{])/g, '$1 $2')
    // Fix missing spaces after closing parentheses and brackets
    .replace(/([)\]}])([A-Za-z])/g, '$1 $2')
    // Fix multiple consecutive spaces
    .replace(/\s{2,}/g, ' ')
    // Fix spaces before punctuation (common OCR error)
    .replace(/\s+([.,:;!?])/g, '$1')
    // Fix words incorrectly split with spaces
    .replace(/\b(a|an|the|of|in|on|at|by|for|with|to|from)\s+([bcdfghjklmnpqrstvwxyz])\b/gi, 
             (match, article, consonant) => article + consonant)
    // Fix common split contractions
    .replace(/\bca n't\b/gi, "can't")
    .replace(/\bdo n't\b/gi, "don't")
    .replace(/\bwo n't\b/gi, "won't")
    .replace(/\bsha n't\b/gi, "shan't")
    .replace(/\bis n't\b/gi, "isn't")
    .replace(/\bare n't\b/gi, "aren't")
    .replace(/\bwas n't\b/gi, "wasn't")
    .replace(/\bwere n't\b/gi, "weren't")
    .replace(/\bhave n't\b/gi, "haven't")
    .replace(/\bhas n't\b/gi, "hasn't")
    .replace(/\bhad n't\b/gi, "hadn't")
    .replace(/\bwould n't\b/gi, "wouldn't")
    .replace(/\bshould n't\b/gi, "shouldn't")
    .replace(/\bcould n't\b/gi, "couldn't");
}

/**
 * Removes common header and footer patterns that shouldn't be in the content.
 */
function removeHeadersFooters(text: string): string {
  let cleaned = text;
  
  // Apply all header/footer removal patterns
  for (const pattern of HEADER_FOOTER_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove standalone lines with just numbers, letters, or short phrases
  cleaned = cleaned.replace(/^\s*[A-Za-z0-9]{1,3}\s*$/gm, '');
  
  // Remove lines that are likely page headers (repeated capitalized phrases)
  cleaned = cleaned.replace(/^[A-Z\s]{10,50}$/gm, '');
  
  // Clean up resulting empty lines
  cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return cleaned;
}

/**
 * Normalizes paragraph breaks and formatting.
 */
function normalizeParagraphs(text: string): string {
  return text
    // Convert multiple line breaks to double line breaks (paragraph separation)
    .replace(/\n{3,}/g, '\n\n')
    // Fix sentences that were incorrectly split across lines
    .replace(/([a-z,])\n([a-z])/g, '$1 $2')
    // Preserve intentional paragraph breaks
    .replace(/([.!?])\n([A-Z])/g, '$1\n\n$2')
    // Clean up leading/trailing whitespace
    .trim();
}

/**
 * Validates that the text cleaning didn't destroy important content.
 */
function validateCleanedText(originalText: string, cleanedText: string): boolean {
  const originalLength = originalText.length;
  const cleanedLength = cleanedText.length;
  
  // If we removed more than 60% of the text, something went wrong
  if (cleanedLength < originalLength * 0.4) {
    console.warn('OCR cleaning removed too much text, using more conservative approach');
    return false;
  }
  
  // Check that we still have reasonable word count
  const originalWords = originalText.split(/\s+/).length;
  const cleanedWords = cleanedText.split(/\s+/).length;
  
  if (cleanedWords < originalWords * 0.5) {
    console.warn('OCR cleaning removed too many words, using more conservative approach');
    return false;
  }
  
  return true;
}

/**
 * Main OCR error correction function with async yielding support.
 * 
 * Processes text extracted from PDFs to fix common OCR errors including:
 * - Character recognition errors (rn->m, 0->O, etc.)
 * - Word boundary and spacing issues
 * - Hyphenated words broken across lines
 * - Header/footer removal
 * - Paragraph normalization
 * 
 * This function is deterministic and does not rely on AI services,
 * making it suitable for production environments where reliability
 * and consistency are critical.
 * 
 * Enhanced with async yielding to prevent event loop blocking on large documents.
 * 
 * @param text Raw text extracted from PDF via OCR
 * @returns Cleaned, corrected text ready for chunking and embedding
 */
export function fixOcrErrors(text: string): string {
  // For backward compatibility, call the sync version
  return fixOcrErrorsSync(text);
}

/**
 * Async version of OCR error correction with yielding support.
 * Prevents event loop blocking by yielding control during processing.
 * 
 * @param text Raw text extracted from PDF via OCR
 * @returns Promise resolving to cleaned, corrected text
 */
export async function fixOcrErrorsAsync(text: string): Promise<string> {
  if (!text || typeof text !== 'string') {
    console.warn('fixOcrErrorsAsync received invalid input:', typeof text);
    return '';
  }
  
  if (text.length < 10) {
    console.warn('fixOcrErrorsAsync received very short text, returning as-is');
    return text.trim();
  }
  
  // PERFORMANCE SAFEGUARD: For very large documents, use fast-path processing
  const MAX_SIZE_FOR_FULL_PROCESSING = 500000; // 500KB limit for full OCR processing
  const isLargeDocument = text.length > MAX_SIZE_FOR_FULL_PROCESSING;
  
  if (isLargeDocument) {
    console.log(`Large document detected (${text.length} chars), using fast-path processing`);
    return fastPathOcrCorrection(text);
  }
  
  console.log(`Starting async OCR correction on ${text.length} characters`);
  
  try {
    const startTime = Date.now();
    
    // Step 1: Fix hyphenated words (must be done first, before other spacing fixes)
    let cleaned = fixHyphenatedWords(text);
    console.log('✓ Fixed hyphenated words');
    
    // Yield control after hyphenation fixes
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Step 2: Correct character recognition errors
    cleaned = correctCharacterErrors(cleaned);
    console.log('✓ Corrected character errors');
    
    // Yield control after character corrections
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Step 3: Fix word boundaries and spacing
    cleaned = fixWordBoundaries(cleaned);
    console.log('✓ Fixed word boundaries');
    
    // Yield control after word boundary fixes
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Step 4: Remove headers and footers
    cleaned = removeHeadersFooters(cleaned);
    console.log('✓ Removed headers/footers');
    
    // Yield control after header/footer removal
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Step 5: Normalize paragraphs
    cleaned = normalizeParagraphs(cleaned);
    console.log('✓ Normalized paragraphs');
    
    // Validation step
    if (!validateCleanedText(text, cleaned)) {
      // Fall back to minimal cleaning if aggressive cleaning removed too much
      console.log('Using conservative cleaning approach');
      cleaned = text
        .replace(/-\n/g, '') // Just fix hyphenation
        .replace(/\n/g, ' ') // Convert to single spaces
        .replace(/\s+/g, ' ') // Normalize spacing
        .trim();
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`OCR correction complete: ${text.length} -> ${cleaned.length} characters (${processingTime}ms)`);
    return cleaned;
    
  } catch (error) {
    console.error('Error in async OCR correction:', error);
    // Fallback: return minimally processed text
    return fastPathOcrCorrection(text);
  }
}

/**
 * Synchronous version of OCR error correction (original implementation).
 * Kept for backward compatibility and when async behavior is not needed.
 * 
 * @param text Raw text extracted from PDF via OCR
 * @returns Cleaned, corrected text ready for chunking and embedding
 */
function fixOcrErrorsSync(text: string): string {
  if (!text || typeof text !== 'string') {
    console.warn('fixOcrErrorsSync received invalid input:', typeof text);
    return '';
  }
  
  if (text.length < 10) {
    console.warn('fixOcrErrorsSync received very short text, returning as-is');
    return text.trim();
  }
  
  // PERFORMANCE SAFEGUARD: For very large documents, use fast-path processing
  const MAX_SIZE_FOR_FULL_PROCESSING = 500000; // 500KB limit for full OCR processing
  const isLargeDocument = text.length > MAX_SIZE_FOR_FULL_PROCESSING;
  
  if (isLargeDocument) {
    console.log(`Large document detected (${text.length} chars), using fast-path processing`);
    return fastPathOcrCorrection(text);
  }
  
  console.log(`Starting full OCR correction on ${text.length} characters`);
  
  try {
    const startTime = Date.now();
    
    // Step 1: Fix hyphenated words (must be done first, before other spacing fixes)
    let cleaned = fixHyphenatedWords(text);
    console.log('✓ Fixed hyphenated words');
    
    // Step 2: Correct character recognition errors
    cleaned = correctCharacterErrors(cleaned);
    console.log('✓ Corrected character errors');
    
    // Step 3: Fix word boundaries and spacing
    cleaned = fixWordBoundaries(cleaned);
    console.log('✓ Fixed word boundaries');
    
    // Step 4: Remove headers and footers
    cleaned = removeHeadersFooters(cleaned);
    console.log('✓ Removed headers/footers');
    
    // Step 5: Normalize paragraphs
    cleaned = normalizeParagraphs(cleaned);
    console.log('✓ Normalized paragraphs');
    
    // Validation step
    if (!validateCleanedText(text, cleaned)) {
      // Fall back to minimal cleaning if aggressive cleaning removed too much
      console.log('Using conservative cleaning approach');
      cleaned = text
        .replace(/-\n/g, '') // Just fix hyphenation
        .replace(/\n/g, ' ') // Convert to single spaces
        .replace(/\s+/g, ' ') // Normalize spacing
        .trim();
    }
    
    const processingTime = Date.now() - startTime;
    console.log(`OCR correction complete: ${text.length} -> ${cleaned.length} characters (${processingTime}ms)`);
    return cleaned;
    
  } catch (error) {
    console.error('Error in sync OCR correction:', error);
    // Fallback: return minimally processed text
    return fastPathOcrCorrection(text);
  }
}

/**
 * Fast-path OCR correction for large documents to prevent performance issues.
 * Uses only essential corrections to maintain performance while providing basic cleanup.
 */
function fastPathOcrCorrection(text: string): string {
  console.log('Using fast-path OCR correction for large document');
  
  return text
    // Essential hyphenation fixes
    .replace(/-\n/g, '') 
    // Essential character fixes (most common only)
    .replace(/rn/g, 'm')
    .replace(/\u2018/g, "'").replace(/\u2019/g, "'")
    .replace(/\u201C/g, '"').replace(/\u201D/g, '"')
    // Essential spacing
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Utility function for testing OCR corrections.
 * Provides detailed analysis of what corrections were applied.
 */
export function analyzeOcrCorrections(text: string): {
  original: string;
  corrected: string;
  corrections: Array<{ type: string; from: string; to: string; count: number }>;
} {
  const original = text;
  const corrected = fixOcrErrors(text);
  
  const corrections: Array<{ type: string; from: string; to: string; count: number }> = [];
  
  // Analyze character corrections
  Array.from(OCR_CHARACTER_CORRECTIONS.entries()).forEach(([wrong, right]) => {
    const regex = new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = (original.match(regex) || []).length;
    if (matches > 0) {
      corrections.push({
        type: 'character',
        from: wrong,
        to: right,
        count: matches
      });
    }
  });
  
  // Analyze business term corrections
  Array.from(BUSINESS_LEGAL_TERMS.entries()).forEach(([wrong, right]) => {
    const regex = new RegExp(`\\b${wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = (original.match(regex) || []).length;
    if (matches > 0) {
      corrections.push({
        type: 'business_term',
        from: wrong,
        to: right,
        count: matches
      });
    }
  });
  
  return { original, corrected, corrections };
}