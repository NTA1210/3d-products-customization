import {CanActivate,ExecutionContext,Injectable,UnauthorizedException} from '@nestjs/common';
import {createClient,SupabaseClient} from '@supabase/supabase-js';
import {requiredEnv} from '../config';
import {PrismaService} from '../prisma/prisma.service';

export type AuthUser={id:string;email:string};
export type AuthRequest={headers:{authorization?:string};authUser?:AuthUser};

@Injectable()
export class SupabaseAuthGuard implements CanActivate{
  private readonly client:SupabaseClient;
  constructor(private readonly db:PrismaService){
    this.client=createClient(requiredEnv('SUPABASE_URL'),requiredEnv('SUPABASE_PUBLISHABLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  }
  async canActivate(context:ExecutionContext){
    const request=context.switchToHttp().getRequest<AuthRequest>();
    const header=request.headers.authorization;
    const token=header?.startsWith('Bearer ')?header.slice(7).trim():undefined;
    if(!token)throw new UnauthorizedException('Bearer access token is required.');
    const{data,error}=await this.client.auth.getUser(token);
    const user=data.user;
    if(error||!user)throw new UnauthorizedException('Supabase access token is invalid or expired.');
    const email=user.email?.trim().toLowerCase();
    if(!email)throw new UnauthorizedException('An email identity is required for Phase 1 accounts.');
    await this.db.user.upsert({where:{id:user.id},update:{email},create:{id:user.id,email}});
    request.authUser={id:user.id,email};
    return true;
  }
}

export function requireAuthUser(request:AuthRequest):AuthUser{
  if(!request.authUser)throw new UnauthorizedException('Authenticated user is missing from request context.');
  return request.authUser;
}
