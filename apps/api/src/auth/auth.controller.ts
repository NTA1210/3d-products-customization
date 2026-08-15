import {Controller,Get,Req,UseGuards} from '@nestjs/common';
import {AuthRequest,requireAuthUser,SupabaseAuthGuard} from './auth.service';
@Controller('auth')
@UseGuards(SupabaseAuthGuard)
export class AuthController{
  @Get('me') me(@Req()request:AuthRequest){return requireAuthUser(request);}
}
