import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { UserResponseDto } from '../dto/user-response.dto';
import { CreateUserCommand } from '../commands/create-user/create-user.command';
import { CreateUserHandler } from '../commands/create-user/create-user.handler';
import { UpdateUserCommand } from '../commands/update-user/update-user.command';
import { UpdateUserHandler } from '../commands/update-user/update-user.handler';
import { DeleteUserCommand } from '../commands/delete-user/delete-user.command';
import { DeleteUserHandler } from '../commands/delete-user/delete-user.handler';
import { GetUserHandler } from '../queries/get-user/get-user.handler';
import { ListUsersHandler } from '../queries/list-users/list-users.handler';
import { SearchUsersHandler } from '../queries/search-users/search-users.handler';

@Controller('users')
export class UsersController {
  constructor(
    private readonly createUserHandler: CreateUserHandler,
    private readonly updateUserHandler: UpdateUserHandler,
    private readonly deleteUserHandler: DeleteUserHandler,
    private readonly getUserHandler: GetUserHandler,
    private readonly listUsersHandler: ListUsersHandler,
    private readonly searchUsersHandler: SearchUsersHandler,
  ) {}

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const user = await this.createUserHandler.execute(
      new CreateUserCommand(dto),
    );
    return UserResponseDto.from(user);
  }

  @Get()
  async findAll(@Query('page') page?: number, @Query('limit') limit?: number) {
    return this.listUsersHandler.execute({ page, limit });
  }

  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.searchUsersHandler.execute({ q, page, limit });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const user = await this.getUserHandler.execute(id);
    return UserResponseDto.from(user);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const user = await this.updateUserHandler.execute(
      new UpdateUserCommand(id, dto),
    );
    return UserResponseDto.from(user);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.deleteUserHandler.execute(new DeleteUserCommand(id));
  }
}
