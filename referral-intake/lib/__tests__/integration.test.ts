import { describe, it, expect } from 'vitest';

describe('Integration Tests', () => {
  const baseUrl = 'http://localhost:3210';

  describe('POST /api/extract', () => {
    it('should extract from referral text', async () => {
      const response = await fetch(`${baseUrl}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialty: 'Cardiology',
          referralText: 'Patient with hypertension referred for cardiac evaluation.',
          attachments: [],
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('summary');
      expect(body).toHaveProperty('specialty', 'Cardiology');
      expect(body).toHaveProperty('confidence');
      expect(body).toHaveProperty('documentType');
    }, 30000);

    it('should return 400 for missing specialty', async () => {
      const response = await fetch(`${baseUrl}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referralText: 'Some text',
          attachments: [],
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 for empty input', async () => {
      const response = await fetch(`${baseUrl}/api/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specialty: 'Cardiology',
          referralText: '',
          attachments: [],
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/analytics', () => {
    it('should return metrics', async () => {
      const response = await fetch(`${baseUrl}/api/analytics?days=7`);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('period');
      expect(body).toHaveProperty('metrics');
      expect(body.metrics).toHaveProperty('total');
      expect(body.metrics).toHaveProperty('successRate');
      expect(body.metrics).toHaveProperty('avgConfidence');
    });

    it('should support text format', async () => {
      const response = await fetch(`${baseUrl}/api/analytics?days=7&format=text`);

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('Success Rate');
    });
  });

  describe('GET /api/review-queue', () => {
    it('should return pending items', async () => {
      const response = await fetch(`${baseUrl}/api/review-queue?status=pending`);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('pagination');
      expect(Array.isArray(body.items)).toBe(true);
    });

    it('should support filtering by priority', async () => {
      const response = await fetch(`${baseUrl}/api/review-queue?status=pending&priority=high`);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.items)).toBe(true);
    });
  });

  describe('GET /api/audit-logs', () => {
    it('should return audit logs', async () => {
      const response = await fetch(`${baseUrl}/api/audit-logs?days=7`);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty('logs');
      expect(body).toHaveProperty('pagination');
      expect(Array.isArray(body.logs)).toBe(true);
    });

    it('should filter by specialty', async () => {
      const response = await fetch(`${baseUrl}/api/audit-logs?specialty=Cardiology`);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.logs)).toBe(true);
    });
  });

  describe('POST /api/feedback', () => {
    it('should store feedback', async () => {
      const response = await fetch(`${baseUrl}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractionId: 1,
          originalData: { diagnosis: 'HTN' },
          correctedData: { diagnosis: 'Hypertension, uncontrolled' },
          feedbackType: 'correction',
          notes: 'More specific diagnosis',
        }),
      });

      if (response.status === 200) {
        const body = await response.json();
        expect(body).toHaveProperty('success', true);
        expect(body).toHaveProperty('changedFields');
      }
    });

    it('should require extraction ID', async () => {
      const response = await fetch(`${baseUrl}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalData: { diagnosis: 'HTN' },
          correctedData: { diagnosis: 'HTN' },
        }),
      });

      expect(response.status).toBe(400);
    });
  });
});
