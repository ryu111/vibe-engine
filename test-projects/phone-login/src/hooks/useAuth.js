import { useState, useCallback } from 'react';
import { sendVerificationCode, verifyCode } from '../api/auth';

/**
 * 登入步驟常量
 */
export const LOGIN_STEPS = {
  PHONE_INPUT: 'phone_input',
  CODE_INPUT: 'code_input',
  SUCCESS: 'success'
};

/**
 * 認證狀態管理 Hook
 */
export function useAuth() {
  const [step, setStep] = useState(LOGIN_STEPS.PHONE_INPUT);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

  /**
   * 發送驗證碼
   */
  const handleSendCode = useCallback(async (phone) => {
    setLoading(true);
    setError('');

    try {
      const result = await sendVerificationCode(phone);

      if (result.success) {
        setPhoneNumber(phone);
        setStep(LOGIN_STEPS.CODE_INPUT);
      } else {
        setError(result.message);
      }
    } catch {
      setError('發送失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * 驗證驗證碼
   */
  const handleVerifyCode = useCallback(async (code) => {
    setLoading(true);
    setError('');

    try {
      const result = await verifyCode(phoneNumber, code);

      if (result.success) {
        setUser(result.user);
        setStep(LOGIN_STEPS.SUCCESS);
      } else {
        setError(result.message);
      }
    } catch {
      setError('驗證失敗，請稍後再試');
    } finally {
      setLoading(false);
    }
  }, [phoneNumber]);

  /**
   * 重新發送驗證碼
   */
  const handleResendCode = useCallback(async () => {
    await handleSendCode(phoneNumber);
  }, [handleSendCode, phoneNumber]);

  /**
   * 返回上一步
   */
  const handleBack = useCallback(() => {
    setStep(LOGIN_STEPS.PHONE_INPUT);
    setError('');
  }, []);

  /**
   * 登出
   */
  const handleLogout = useCallback(() => {
    setUser(null);
    setPhoneNumber('');
    setStep(LOGIN_STEPS.PHONE_INPUT);
    setError('');
  }, []);

  return {
    step,
    phoneNumber,
    loading,
    error,
    user,
    handleSendCode,
    handleVerifyCode,
    handleResendCode,
    handleBack,
    handleLogout
  };
}
