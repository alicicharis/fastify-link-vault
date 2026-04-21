export const createLinkBody = {
  type: 'object',
  properties: {
    original_url: { type: 'string', format: 'uri' },
    expires_at: { type: 'string', format: 'date-time' },
  },
  required: ['original_url'],
  additionalProperties: false,
} as const;
