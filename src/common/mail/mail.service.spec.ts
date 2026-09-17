import { createTransport } from 'nodemailer';
import { MailService } from './mail.service';

// Mock nodemailer so tests never attempt a real SMTP connection.
jest.mock('nodemailer', () => {
  const sendMail = jest.fn().mockResolvedValue({ messageId: 'mocked' });
  return {
    createTransport: jest.fn(() => ({ sendMail })),
  };
});

// Mock envs before the service imports it, to avoid Joi validation failure
// and to control FRONTEND_URL/API_URL deliberately.
jest.mock('../../config/envs', () => ({
  envs: {
    SMTP_HOST: 'smtp.test.com',
    SMTP_PORT: 587,
    SMTP_USER: 'user',
    SMTP_PASS: 'pass',
    SMTP_FROM: 'no-reply@test.com',
    FRONTEND_URL: 'https://app.followapp.test',
    API_URL: 'https://api.followapp.test',
    VERIFICATION_TOKEN_EXPIRY_HOURS: 24,
  },
}));

describe('MailService', () => {
  let service: MailService;
  let sendMailMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MailService();
    sendMailMock = (
      (createTransport as unknown as jest.Mock).mock.results[0].value as {
        sendMail: jest.Mock;
      }
    ).sendMail;
  });

  it('builds the verification link with FRONTEND_URL and the frontend page path (D-034)', async () => {
    await service.sendVerificationEmail('user@example.com', 'token-abc');

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.to).toBe('user@example.com');
    expect(payload.html).toContain(
      'https://app.followapp.test/verify-email?token=token-abc',
    );
  });

  it('does not point the verification link at the backend API (D-034)', async () => {
    await service.sendVerificationEmail('user@example.com', 'token-abc');

    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.html).not.toContain(
      'https://api.followapp.test/auth/verify-email',
    );
    expect(payload.html).not.toContain('http://localhost:3001');
  });

  it('keeps the password reset link pointing to FRONTEND_URL/reset-password (D-028)', async () => {
    await service.sendPasswordResetEmail('user@example.com', 'reset-token');

    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.html).toContain(
      'https://app.followapp.test/reset-password?token=reset-token',
    );
  });
});
