import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendVerificationCode, verifyCode } from './auth';

describe('Auth API', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  describe('sendVerificationCode', () => {
    it('should reject invalid phone number format', async () => {
      const promise = sendVerificationCode('1234567890');
      vi.advanceTimersByTime(1000);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.message).toContain('格式不正確');
    });

    it('should accept valid Taiwan phone number', async () => {
      const promise = sendVerificationCode('0912345678');
      vi.advanceTimersByTime(1000);
      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.message).toContain('已發送');
    });
  });

  describe('verifyCode', () => {
    it('should fail if no code was sent', async () => {
      const promise = verifyCode('0911111111', '123456');
      vi.advanceTimersByTime(800);
      const result = await promise;

      expect(result.success).toBe(false);
      expect(result.message).toContain('請先發送');
    });

    it('should fail with wrong code', async () => {
      // First send a code
      const sendPromise = sendVerificationCode('0912345678');
      vi.advanceTimersByTime(1000);
      await sendPromise;

      // Try to verify with wrong code
      const verifyPromise = verifyCode('0912345678', '000000');
      vi.advanceTimersByTime(800);
      const result = await verifyPromise;

      expect(result.success).toBe(false);
      expect(result.message).toContain('錯誤');
    });

    it('should succeed with correct code (by checking console output)', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      // Send code
      const sendPromise = sendVerificationCode('0912345678');
      vi.advanceTimersByTime(1000);
      await sendPromise;

      // Get the code from console output
      const codeLog = consoleSpy.mock.calls.find(call =>
        call[0].includes('驗證碼已發送')
      );
      expect(codeLog).toBeDefined();

      // Extract the 6-digit code
      const codeMatch = codeLog[0].match(/(\d{6})$/);
      expect(codeMatch).toBeDefined();
      const code = codeMatch[1];

      // Verify with correct code
      const verifyPromise = verifyCode('0912345678', code);
      vi.advanceTimersByTime(800);
      const result = await verifyPromise;

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user.phone).toBe('0912345678');

      consoleSpy.mockRestore();
    });
  });
});
