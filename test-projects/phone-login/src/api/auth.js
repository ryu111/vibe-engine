/**
 * Mock Authentication API
 * 模擬手機驗證碼登入的後端邏輯
 */

// 模擬已發送的驗證碼（實際應用中這會在後端處理）
const sentCodes = new Map();

/**
 * 發送驗證碼到手機號碼
 * @param {string} phoneNumber - 手機號碼
 * @returns {Promise<{success: boolean, message: string}>}
 */
export async function sendVerificationCode(phoneNumber) {
  // 模擬網路延遲
  await delay(1000);

  // 驗證手機號碼格式（台灣格式：09xxxxxxxx）
  const phoneRegex = /^09\d{8}$/;
  if (!phoneRegex.test(phoneNumber)) {
    return {
      success: false,
      message: '手機號碼格式不正確，請輸入 09 開頭的 10 位數字'
    };
  }

  // 生成 6 位數驗證碼
  const code = Math.floor(100000 + Math.random() * 900000).toString();

  // 儲存驗證碼（60 秒過期）
  sentCodes.set(phoneNumber, {
    code,
    expiresAt: Date.now() + 60000
  });

  // 在 console 顯示驗證碼（方便測試）
  console.log(`[Mock API] 驗證碼已發送到 ${phoneNumber}: ${code}`);

  return {
    success: true,
    message: '驗證碼已發送，請查看 Console（測試用）'
  };
}

/**
 * 驗證驗證碼
 * @param {string} phoneNumber - 手機號碼
 * @param {string} code - 驗證碼
 * @returns {Promise<{success: boolean, message: string, user?: object}>}
 */
export async function verifyCode(phoneNumber, code) {
  // 模擬網路延遲
  await delay(800);

  const storedData = sentCodes.get(phoneNumber);

  if (!storedData) {
    return {
      success: false,
      message: '請先發送驗證碼'
    };
  }

  if (Date.now() > storedData.expiresAt) {
    sentCodes.delete(phoneNumber);
    return {
      success: false,
      message: '驗證碼已過期，請重新發送'
    };
  }

  if (storedData.code !== code) {
    return {
      success: false,
      message: '驗證碼錯誤，請重新輸入'
    };
  }

  // 驗證成功，清除驗證碼
  sentCodes.delete(phoneNumber);

  return {
    success: true,
    message: '登入成功',
    user: {
      id: `user_${Date.now()}`,
      phone: phoneNumber,
      createdAt: new Date().toISOString()
    }
  };
}

/**
 * 工具函數：延遲
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
