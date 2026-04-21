export const listLinksResponse = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      short_code: { type: 'string' },
      short_url: { type: 'string' },
      original_url: { type: 'string' },
      created_at: { type: 'string' },
      click_count: { type: 'number' },
    },
  },
} as const;

export const createLinkBody = {
  type: 'object',
  properties: {
    original_url: { type: 'string', format: 'uri' },
    expires_at: { type: 'string', format: 'date-time' },
  },
  required: ['original_url'],
  additionalProperties: false,
} as const;
