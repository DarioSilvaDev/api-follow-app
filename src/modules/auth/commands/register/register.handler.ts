import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcrypt';
import { USER_REPOSITORY } from '../../../users/tokens';
import type { UserRepository } from '../../../users/repositories/user.repository';
import { AUTH_REPOSITORY } from '../../tokens';
import type { AuthRepository } from '../../repositories/auth.repository';
import { UserResponseDto } from '../../../users/dto/user-response.dto';
import { AuthResponseDto } from '../../dto/auth-response.dto';
import { UserRegisteredEvent } from '../../events/user-registered.event';
import { RegisterCommand } from './register.command';

@Injectable()
export class RegisterHandler {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: AuthRepository,
    private readonly jwtService: JwtService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(command: RegisterCommand) {
    const { email } = command.dto;

    const existing = await this.userRepository.findByEmail(email);
    if (existing) {
      throw new UnauthorizedException('Email already registered');
    }

    const { password, ...rest } = command.dto;
    const passwordHash = await bcrypt.hash(password, 10);

    const user = await this.userRepository.create({ ...rest, passwordHash });

    // const payload = { sub: user.id, email: user.email };
    // const accessToken = this.jwtService.sign(payload);
    // const refreshToken = uuid();

    // const expiresAt = new Date();
    // expiresAt.setDate(expiresAt.getDate() + 7);

    // await this.authRepository.createSession({
    //   userId: user.id,
    //   refreshToken,
    //   expiresAt,
    // });

    this.eventEmitter.emit(
      'auth.user.registered',
      new UserRegisteredEvent(user.id, user.email),
    );

    return AuthResponseDto.from(
      UserResponseDto.from(user),
      // accessToken,
      // refreshToken,
    );
  }
}
