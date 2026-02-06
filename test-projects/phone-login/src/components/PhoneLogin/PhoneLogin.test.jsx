import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhoneLogin } from './PhoneLogin';

describe('PhoneLogin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should render phone input initially', () => {
    render(<PhoneLogin />);

    expect(screen.getByText('手機號碼登入')).toBeInTheDocument();
    expect(screen.getByLabelText('手機號碼')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /發送驗證碼/i })).toBeInTheDocument();
  });

  it('should disable submit button for invalid phone', () => {
    render(<PhoneLogin />);

    const submitBtn = screen.getByRole('button', { name: /發送驗證碼/i });
    expect(submitBtn).toBeDisabled();

    const input = screen.getByLabelText('手機號碼');
    fireEvent.change(input, { target: { value: '123' } });

    expect(submitBtn).toBeDisabled();
  });

  it('should enable submit button for valid phone', () => {
    render(<PhoneLogin />);

    const input = screen.getByLabelText('手機號碼');
    fireEvent.change(input, { target: { value: '0912345678' } });

    const submitBtn = screen.getByRole('button', { name: /發送驗證碼/i });
    expect(submitBtn).not.toBeDisabled();
  });

  it('should only allow numeric input', () => {
    render(<PhoneLogin />);

    const input = screen.getByLabelText('手機號碼');
    fireEvent.change(input, { target: { value: '09abc123def45678' } });

    expect(input.value).toBe('0912345678');
  });

  it('should navigate to verification code screen on submit', async () => {
    render(<PhoneLogin />);

    const input = screen.getByLabelText('手機號碼');
    fireEvent.change(input, { target: { value: '0912345678' } });

    const submitBtn = screen.getByRole('button', { name: /發送驗證碼/i });
    fireEvent.click(submitBtn);

    // Advance timers for the mock API delay
    vi.advanceTimersByTime(1100);

    await waitFor(() => {
      expect(screen.getByText(/驗證碼已發送至/i)).toBeInTheDocument();
    });
  });

  it('should mask phone number in verification screen', async () => {
    render(<PhoneLogin />);

    const input = screen.getByLabelText('手機號碼');
    fireEvent.change(input, { target: { value: '0912345678' } });

    const submitBtn = screen.getByRole('button', { name: /發送驗證碼/i });
    fireEvent.click(submitBtn);

    vi.advanceTimersByTime(1100);

    await waitFor(() => {
      expect(screen.getByText(/0912\*\*\*678/i)).toBeInTheDocument();
    });
  });

  it('should allow going back to phone input', async () => {
    render(<PhoneLogin />);

    // Enter phone and submit
    const input = screen.getByLabelText('手機號碼');
    fireEvent.change(input, { target: { value: '0912345678' } });
    fireEvent.click(screen.getByRole('button', { name: /發送驗證碼/i }));

    vi.advanceTimersByTime(1100);

    await waitFor(() => {
      expect(screen.getByText(/驗證碼已發送至/i)).toBeInTheDocument();
    });

    // Click back button
    const backBtn = screen.getByRole('button', { name: /返回/i });
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.getByLabelText('手機號碼')).toBeInTheDocument();
    });
  });
});
