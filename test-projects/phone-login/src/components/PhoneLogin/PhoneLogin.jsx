import { useAuth, LOGIN_STEPS } from '../../hooks/useAuth';
import { PhoneInput } from './PhoneInput';
import { VerificationCode } from './VerificationCode';
import './PhoneLogin.css';

/**
 * 手機登入主元件
 */
export function PhoneLogin() {
  const {
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
  } = useAuth();

  // 登入成功畫面
  if (step === LOGIN_STEPS.SUCCESS && user) {
    return (
      <div className="phone-login">
        <div className="login-card success-card">
          <div className="success-icon">✓</div>
          <h2>登入成功</h2>
          <div className="user-info">
            <p><strong>手機號碼：</strong>{user.phone}</p>
            <p><strong>用戶 ID：</strong>{user.id}</p>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            登出
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-login">
      <div className="login-card">
        <h2>手機號碼登入</h2>

        {step === LOGIN_STEPS.PHONE_INPUT && (
          <PhoneInput
            onSubmit={handleSendCode}
            loading={loading}
            error={error}
          />
        )}

        {step === LOGIN_STEPS.CODE_INPUT && (
          <VerificationCode
            phoneNumber={phoneNumber}
            onSubmit={handleVerifyCode}
            onResend={handleResendCode}
            onBack={handleBack}
            loading={loading}
            error={error}
          />
        )}
      </div>
    </div>
  );
}
