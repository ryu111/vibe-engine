import { useState } from 'react';
import PropTypes from 'prop-types';

/**
 * 手機號碼輸入元件
 */
export function PhoneInput({ onSubmit, loading, error }) {
  const [phone, setPhone] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (phone.trim()) {
      onSubmit(phone.trim());
    }
  };

  const handleChange = (e) => {
    // 只允許數字
    const value = e.target.value.replace(/\D/g, '');
    // 限制長度為 10
    setPhone(value.slice(0, 10));
  };

  const isValid = /^09\d{8}$/.test(phone);

  return (
    <form className="phone-input-form" onSubmit={handleSubmit}>
      <div className="input-group">
        <label htmlFor="phone">手機號碼</label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={handleChange}
          placeholder="0912345678"
          disabled={loading}
          autoFocus
          autoComplete="tel"
        />
        <span className="input-hint">
          請輸入 09 開頭的 10 位數字
        </span>
      </div>

      {error && <div className="error-message">{error}</div>}

      <button
        type="submit"
        disabled={!isValid || loading}
        className="submit-btn"
      >
        {loading ? '發送中...' : '發送驗證碼'}
      </button>
    </form>
  );
}

PhoneInput.propTypes = {
  onSubmit: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string
};

PhoneInput.defaultProps = {
  loading: false,
  error: ''
};
