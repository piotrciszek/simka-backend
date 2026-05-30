import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'SimBasket API',
      version: '1.0.0',
      description: 'REST API dla aplikacji ligi koszykówki Fastbreak Basketball',
      contact: {
        name: 'Piotr Ciszek',
        email: 'piotr.ciszek@example.com',
      },
    },
    tags: [
      {
        name: 'Authentication',
        description: 'Endpointy związane z logowaniem i autoryzacją',
      },
      {
        name: 'Teams',
        description: 'Zarządzanie drużynami',
      },
      {
        name: 'Tactics',
        description: 'Taktyki drużyn (draft → pending → approved)',
      },
      {
        name: 'Users',
        description: 'Zarządzanie użytkownikami',
      },
      {
        name: 'Files',
        description: 'Upload i pobieranie plików (CSV, PBP, saves)',
      },
    ],
    servers: [
      {
        url: process.env.NODE_ENV === 'production'
          ? 'https://app.simbasket.pl/api'
          : 'http://localhost:3000',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token otrzymany z endpointu /auth/login'
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            username: { type: 'string', example: 'admin' },
            role: { type: 'string', enum: ['admin', 'komisz', 'user'], example: 'admin' },
            team_id: { type: 'integer', nullable: true, example: 5 },
          },
        },
        Team: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            name: { type: 'string', example: 'Lakers' },
            city: { type: 'string', example: 'Los Angeles' },
            owner: { type: 'string', example: 'John Doe' },
          },
        },
        Tactic: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            team_id: { type: 'integer', example: 5 },
            status: { type: 'string', enum: ['draft', 'pending', 'approved'], example: 'draft' },
            data: { type: 'object', description: 'JSON z ustawieniami taktyki' },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            message: { type: 'string', example: 'Błąd autentykacji' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts'], // Ścieżka do plików z komentarzami JSDoc
};

const specs = swaggerJSDoc(options);

export { swaggerUi, specs };