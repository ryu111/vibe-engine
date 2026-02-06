import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * 驗證碼輸入元件
 */
export function VerificationCode({
  phoneNumber,
  onSubmit,
  onResend,
  onBack,
  loading,
  error
}) {
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(60);

  // 倒計時
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (code.length === 6) {
      onSubmit(code);
    }
  };

  const handleChange = (e) => {
    // 只允許數字，限制 6 位
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
  };

  const handleResend = () => {
    setCountdown(60);
    setCode('');
    onResend();
  };

  const maskedPhone = phoneNumber.replace(/(\d{4})(\d{3})(\d{3})/, '$1***$3');

  return (
    <form className="verification-form" onSubmit={handleSubmit}>
      <div className="verification-header">
        <button
          type="button"
          className="back-btn"
          onClick={onBack}
          disabled={loading}
        >
          ← 返回
        </button>
      </div>

      <p className="verification-hint">
        驗證碼已發送至 <strong>{maskedPhone}</strong>
      </p>

      <div className="input-group">
        <label htmlFor="code">驗證碼</label>
        <input
          id="code"
          type="text"
          inputMode="numeric"
          value={code}
          onChange={handleChange}
          placeholder="請輸入 6 位數驗證碼"
          disabled={loading}
          autoFocus
          autoComplete="one-time-code"
        />
        <span className="input-hint">
          請查看 Console 獲取測試驗證碼
        </span>
      </div>

      {error && <div className="error-message">{error}</div>}

      <button
        type="submit"
        disabled={code.length !== 6 || loading}
        className="submit-btn"
      >
        {loading ? '驗證中...' : '確認登入'}
      </button>

      <div className="resend-section">
        {countdown > 0 ? (
          <span className="countdown">{countdown} 秒後可重新發送</span>
        ) : (
          <button
            type="button"
            className="resend-btn"
            onClick={handleResend}
            disabled={loading}
          >
            重新發送驗證碼
          </button>
        )}
      </div>
    </form>
  );
}

VerificationCode.propTypes = {
  phoneNumber: PropTypes.string.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onResend: PropTypes.func.isRequired,
  onBack: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string
};

VerificationCode.defaultProps = {
  loading: false,
  error: ''
};
