import { faker } from '@faker-js/faker';

/**
 * Test Data Factory for generating consistent test data
 * Provides methods to create realistic test data for E2E tests
 */
export class TestDataFactory {
  
  /**
   * Generate a realistic Internet Archive search query
   */
  static generateSearchQuery(): string {
    const topics = [
      'artificial intelligence',
      'machine learning',
      'software engineering',
      'computer science',
      'data science',
      'programming',
      'algorithms',
      'web development',
      'database design',
      'system architecture'
    ];
    
    return faker.helpers.arrayElement(topics);
  }

  /**
   * Generate test document content with varying lengths
   */
  static generateDocumentContent(type: 'short' | 'medium' | 'long' = 'medium'): string {
    const baseContent = {
      short: 'This is a short test document. It contains minimal content for basic testing.',
      medium: `This is a medium-length test document. It includes multiple sentences and covers various topics related to technology and software development. The content is designed to test document processing and embedding generation effectively.`,
      long: `This is an extensive test document designed for comprehensive testing. It contains multiple paragraphs covering various technical topics including software architecture, database design, API development, and machine learning concepts.

Section 1: Software Architecture
Software architecture represents the fundamental structure of a software system. It defines the major components, their relationships, and how they interact to fulfill the system's requirements. Good architecture enables scalability, maintainability, and performance.

Section 2: Database Design
Effective database design is crucial for application performance. Key principles include proper normalization, indexing strategies, query optimization, and choosing appropriate data types. The design should also consider future scaling requirements.

Section 3: API Development
RESTful API design follows specific conventions that make services predictable and easy to integrate. This includes proper use of HTTP methods, status codes, resource naming, and error handling patterns.

Section 4: Machine Learning Integration
Modern applications increasingly incorporate machine learning capabilities. This requires careful consideration of data pipelines, model deployment, monitoring, and continuous learning systems.`
    };

    return baseContent[type];
  }

  /**
   * Generate realistic chat questions for testing
   */
  static generateChatQuestion(): string {
    const questions = [
      'What is software architecture?',
      'How does database indexing improve performance?',
      'What are the principles of REST API design?',
      'Explain machine learning model deployment',
      'How do you optimize database queries?',
      'What are microservices benefits?',
      'How does caching improve application performance?',
      'What is the difference between SQL and NoSQL?'
    ];

    return faker.helpers.arrayElement(questions);
  }

  /**
   * Generate test user data
   */
  static generateUser() {
    return {
      name: faker.person.fullName(),
      email: faker.internet.email(),
      username: faker.internet.username()
    };
  }

  /**
   * Generate test file metadata
   */
  static generateFileMetadata(format: 'pdf' | 'txt' = 'pdf') {
    const extensions = { pdf: 'PDF', txt: 'Text' };
    
    return {
      identifier: `test-doc-${faker.string.alphanumeric(8)}`,
      title: faker.lorem.sentence(),
      description: faker.lorem.paragraph(),
      creator: faker.person.fullName(),
      date: faker.date.recent().toISOString().split('T')[0],
      format: extensions[format],
      size: faker.number.int({ min: 1024, max: 10485760 }).toString(),
      name: `${faker.lorem.slug()}.${format}`
    };
  }

  /**
   * Generate error scenarios for testing
   */
  static generateErrorScenario() {
    const scenarios = [
      {
        type: 'network_error',
        description: 'Network connection failed',
        expectedMessage: 'network'
      },
      {
        type: 'invalid_format',
        description: 'Unsupported file format',
        expectedMessage: 'format'
      },
      {
        type: 'file_not_found',
        description: 'File not found',
        expectedMessage: 'not found'
      },
      {
        type: 'processing_error',
        description: 'Document processing failed',
        expectedMessage: 'processing'
      }
    ];

    return faker.helpers.arrayElement(scenarios);
  }

  /**
   * Generate performance test data
   */
  static generatePerformanceTestData() {
    return {
      concurrentUsers: faker.number.int({ min: 5, max: 20 }),
      documentsCount: faker.number.int({ min: 10, max: 50 }),
      queriesPerUser: faker.number.int({ min: 3, max: 10 }),
      maxResponseTime: faker.number.int({ min: 5000, max: 30000 })
    };
  }

  /**
   * Generate realistic search terms with expected results
   */
  static generateSearchScenario() {
    const scenarios = [
      {
        query: 'artificial intelligence',
        expectedKeywords: ['ai', 'artificial', 'intelligence', 'machine', 'learning'],
        category: 'technology'
      },
      {
        query: 'software engineering',
        expectedKeywords: ['software', 'engineering', 'development', 'programming'],
        category: 'technology'
      },
      {
        query: 'database design',
        expectedKeywords: ['database', 'design', 'sql', 'data', 'schema'],
        category: 'technology'
      }
    ];

    return faker.helpers.arrayElement(scenarios);
  }

  /**
   * Create seed data for database testing
   */
  static createSeedData(count: number = 5) {
    return Array.from({ length: count }, () => ({
      content: this.generateDocumentContent('medium'),
      metadata: this.generateFileMetadata(),
      embedding: Array.from({ length: 384 }, () => faker.number.float({ min: -1, max: 1 })),
      created_at: faker.date.recent().toISOString()
    }));
  }
}