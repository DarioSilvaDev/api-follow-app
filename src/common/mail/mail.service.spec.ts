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

  it('incluye ?kind=dealership en el link del mail de invitación de concesionaria (D-106)', async () => {
    await service.sendDealershipInvitationEmail(
      'a@b.com',
      'Concesionaria Norte',
      'token-abc',
    );

    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.html).toContain(
      'https://app.followapp.test/invitations/token-abc?kind=dealership',
    );
    expect(payload.html).not.toContain('?kind=workshop');
  });

  it('incluye ?kind=workshop en el link del mail de invitación de taller (D-106)', async () => {
    await service.sendWorkshopInvitationEmail(
      'a@b.com',
      'Taller Norte',
      'token-abc',
    );

    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.html).toContain(
      'https://app.followapp.test/invitations/token-abc?kind=workshop',
    );
    expect(payload.html).not.toContain('?kind=dealership');
  });

  it('mantiene la ruta /invitations/{token} y no mueve el token a query params (D-106)', async () => {
    await service.sendDealershipInvitationEmail('a@b.com', 'D', 'token-abc');
    await service.sendWorkshopInvitationEmail('a@b.com', 'W', 'token-abc');

    const payloads = sendMailMock.mock.calls.map((c) => c[0]);
    expect(payloads.length).toBe(2);
    for (const payload of payloads) {
      expect(payload.html).toContain(
        'https://app.followapp.test/invitations/token-abc?kind=',
      );
      expect(payload.html).not.toContain('?token=');
    }
  });

  it('usa la marca oficial Autentia en todos los mails (decisión PM de marca)', async () => {
    await service.sendVerificationEmail('a@b.com', 'tok');
    await service.sendPasswordResetEmail('a@b.com', 'tok');
    await service.sendPasswordResetCompletedEmail('a@b.com');
    await service.sendWelcomeEmail('a@b.com', 'N');
    await service.sendTransferRequestEmail('a@b.com', 'A', 'B', 'V', 'AB-123');
    await service.sendTransferAcceptedEmail('a@b.com', 'A', 'B', 'V', 'AB-123');
    await service.sendTransferQrExpiredEmail('a@b.com', 'A', 'V', 'AB-123');
    await service.sendDealershipInvitationEmail('a@b.com', 'D', 'tok');
    await service.sendDealershipClaimedEmail('a@b.com', 'D');

    const payloads = sendMailMock.mock.calls.map((c) => c[0]);
    expect(payloads.length).toBe(9);
    for (const payload of payloads) {
      const copy = `${payload.subject} ${payload.html}`;
      expect(copy).toContain('Autentia');
      expect(copy).not.toContain('FollowApp');
    }
  });
});
