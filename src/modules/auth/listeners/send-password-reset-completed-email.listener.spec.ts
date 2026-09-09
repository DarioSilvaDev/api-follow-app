import { SendPasswordResetCompletedEmailListener } from './send-password-reset-completed-email.listener';
import { PasswordResetCompletedEvent } from '../events/password-reset-completed.event';

describe('SendPasswordResetCompletedEmailListener', () => {
  let listener: SendPasswordResetCompletedEmailListener;
  let prismaMock: any;
  let mailServiceMock: any;

  beforeEach(() => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
      },
    };
    mailServiceMock = {
      sendPasswordResetCompletedEmail: jest.fn().mockResolvedValue(undefined),
    };

    listener = new SendPasswordResetCompletedEmailListener(
      prismaMock as any,
      mailServiceMock as any,
    );
  });

  it('sends email when user is found', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
    });

    await listener.handle(new PasswordResetCompletedEvent('user-1'));

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
    });
    expect(
      mailServiceMock.sendPasswordResetCompletedEmail,
    ).toHaveBeenCalledWith('user@example.com');
  });

  it('does not send email when user does not exist', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await listener.handle(new PasswordResetCompletedEvent('nonexistent'));

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'nonexistent' },
    });
    expect(
      mailServiceMock.sendPasswordResetCompletedEmail,
    ).not.toHaveBeenCalled();
  });
});
